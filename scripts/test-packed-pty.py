#!/usr/bin/env python3
"""Exercise the globally installed CLI inside a macOS pseudo-terminal."""

import fcntl
import os
import pty
import select
import signal
import struct
import sys
import time


def main():
    binary, project = sys.argv[1:3]
    rows, columns = map(int, sys.argv[3:5])
    child_pid, master_fd = pty.fork()

    if child_pid == 0:
        os.execv(binary, [binary, project])

    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
    output = bytearray()
    welcome_seen_at = None
    status_sent = False
    child_status = None
    deadline = time.monotonic() + 10

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

                # Emulate the basic replies Apple Terminal sends to OpenTUI's
                # startup probes. A raw PTY does not answer terminal queries.
                if b"\x1b[6n" in chunk:
                    os.write(master_fd, b"\x1b[1;1R")
                if b"\x1b[c" in chunk:
                    os.write(master_fd, b"\x1b[?62;4c")

                if b"AI coding agent for your terminal" in output and welcome_seen_at is None:
                    welcome_seen_at = time.monotonic()

                # Let the REPL finish startup and register its input handler.
                if welcome_seen_at is not None and not status_sent:
                    if time.monotonic() - welcome_seen_at >= 0.5:
                        os.write(master_fd, b"/status\r")
                        status_sent = True

                if status_sent and b"Messages: 0" in output:
                    break

            ended, status = os.waitpid(child_pid, os.WNOHANG)
            if ended:
                child_status = status
                break
    finally:
        # This test validates prompt processing, not shutdown. Terminate the
        # child explicitly so no PTY child can outlive the test process.
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
        raise SystemExit("Packed CLI did not start its REPL and execute /status.")


if __name__ == "__main__":
    import termios
    main()
