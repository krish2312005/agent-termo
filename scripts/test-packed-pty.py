#!/usr/bin/env python3
"""Exercise the packaged CLI inside a real PTY on macOS."""

import fcntl
import os
import pty
import select
import signal
import struct
import sys
import termios
import time


def main():
    binary, project = sys.argv[1:3]
    child_pid, master_fd = pty.fork()

    if child_pid == 0:
        os.execv(binary, [binary, project])

    # Match the user's large Apple Terminal window rather than the runner's
    # default 80x24 size.
    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", 77, 272, 0, 0))
    output = bytearray()
    status_sent = False
    interrupt_sent = False
    deadline = time.monotonic() + 12
    child_status = None

    try:
        while time.monotonic() < deadline:
            ready, _, _ = select.select([master_fd], [], [], 0.1)
            if ready:
                try:
                    chunk = os.read(master_fd, 8192)
                except OSError:
                    break
                if not chunk:
                    break
                output.extend(chunk)

                # The cursor moves to column 3 when the REPL has activated
                # the composer. Wait for that instead of pre-feeding input.
                if (
                    not status_sent
                    and b"AI coding agent for your terminal" in output
                    and b"\x1b[3G" in output
                ):
                    os.write(master_fd, b"/status\r")
                    status_sent = True

                if status_sent and not interrupt_sent and b"Messages: 0" in output:
                    os.write(master_fd, b"\x03")
                    interrupt_sent = True
                    deadline = time.monotonic() + 4

            ended, status = os.waitpid(child_pid, os.WNOHANG)
            if ended:
                child_status = status
                break
    finally:
        if child_status is None:
            try:
                os.kill(child_pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                _, child_status = os.waitpid(child_pid, 0)
            except ChildProcessError:
                child_status = 0
        os.close(master_fd)

    sys.stdout.write(output.decode("utf-8", errors="replace"))
    if not status_sent or b"Messages: 0" not in output:
        raise SystemExit("Packed CLI did not activate the prompt and execute /status.")


if __name__ == "__main__":
    main()
