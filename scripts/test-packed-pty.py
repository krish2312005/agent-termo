#!/usr/bin/env python3
"""Exercise the globally installed CLI inside a macOS pseudo-terminal."""

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
    rows, columns = map(int, sys.argv[3:5])
    child_pid, master_fd = pty.fork()

    if child_pid == 0:
        os.execv(binary, [binary, project])

    fcntl.ioctl(master_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
    output = bytearray()
    cpr_replies = 0
    da1_replies = 0
    status_sent = False
    child_status = None
    startup_ready_at = None
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

                # A PTY is not a terminal emulator. Answer the cursor-position
                # and primary device-attributes queries that close OpenTUI's
                # startup probe window in a real terminal.
                cpr_requests = output.count(b"\\x1b[6n")
                while cpr_replies < cpr_requests:
                    os.write(master_fd, b"\\x1b[1;1R")
                    cpr_replies += 1

                da1_requests = output.count(b"\\x1b[c")
                while da1_replies < da1_requests:
                    os.write(master_fd, b"\\x1b[?62;4c")
                    da1_replies += 1
                    if startup_ready_at is None:
                        startup_ready_at = time.monotonic()

                # Test prompt submission independently of the welcome log.
                # If the welcome row is missing, /status must still be tested.
                if startup_ready_at is not None and not status_sent:
                    if time.monotonic() - startup_ready_at >= 0.5:
                        os.write(master_fd, b"/status\\r")
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

    welcome_seen = b"AI coding agent for your terminal" in output
    status_seen = b"Messages: 0" in output
    sys.stdout.write(output.decode("utf-8", errors="replace"))
    print("PTY_TEST_WELCOME_SEEN=" + ("yes" if welcome_seen else "no"))
    print("PTY_TEST_STATUS_SEEN=" + ("yes" if status_seen else "no"))

    if not status_sent or not status_seen:
        raise SystemExit("Packed CLI did not activate input and execute /status.")


if __name__ == "__main__":
    main()
