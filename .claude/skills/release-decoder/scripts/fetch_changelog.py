#!/usr/bin/env python3
"""
Fetch and parse Claude Code changelog from GitHub.

Usage:
    python fetch_changelog.py                    # Get latest release
    python fetch_changelog.py --version 2.0.71  # Get specific version
    python fetch_changelog.py --from 2.0.60 --to 2.0.71  # Compare versions
    python fetch_changelog.py --list 10         # List last N versions
"""

import argparse
import re
import sys
import urllib.request
import urllib.error
from typing import Optional

CHANGELOG_URL = "https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md"


def fetch_changelog() -> str:
    """Fetch changelog from GitHub."""
    try:
        with urllib.request.urlopen(CHANGELOG_URL, timeout=10) as response:
            return response.read().decode('utf-8')
    except urllib.error.URLError as e:
        print(f"Error fetching changelog: {e}", file=sys.stderr)
        sys.exit(1)


def parse_versions(content: str) -> dict:
    """Parse changelog into version entries."""
    versions = {}
    current_version = None
    current_content = []

    # Pattern matches headers like "## 2.0.71" or "## [2.0.71]" or "## v2.0.71"
    version_pattern = re.compile(r'^##\s+\[?v?(\d+\.\d+\.\d+)\]?', re.IGNORECASE)

    for line in content.split('\n'):
        match = version_pattern.match(line)
        if match:
            if current_version:
                versions[current_version] = '\n'.join(current_content).strip()
            current_version = match.group(1)
            current_content = [line]
        elif current_version:
            current_content.append(line)

    # Don't forget the last version
    if current_version:
        versions[current_version] = '\n'.join(current_content).strip()

    return versions


def get_version_info(versions: dict, version: str) -> Optional[str]:
    """Get release notes for a specific version."""
    return versions.get(version)


def compare_versions(versions: dict, from_ver: str, to_ver: str) -> str:
    """Get all changes between two versions."""
    sorted_versions = sorted(versions.keys(), key=lambda v: [int(x) for x in v.split('.')], reverse=True)

    try:
        from_idx = sorted_versions.index(from_ver)
        to_idx = sorted_versions.index(to_ver)
    except ValueError as e:
        return f"Version not found: {e}"

    # Ensure from is older than to
    if from_idx < to_idx:
        from_idx, to_idx = to_idx, from_idx

    # Get all versions between (exclusive of from, inclusive of to)
    relevant_versions = sorted_versions[to_idx:from_idx]

    result = [f"# Changes from {from_ver} to {to_ver}\n"]
    for ver in relevant_versions:
        result.append(versions[ver])
        result.append("\n---\n")

    return '\n'.join(result)


def list_versions(versions: dict, count: int = 10) -> str:
    """List the most recent versions."""
    sorted_versions = sorted(versions.keys(), key=lambda v: [int(x) for x in v.split('.')], reverse=True)
    return '\n'.join(f"- {v}" for v in sorted_versions[:count])


def main():
    parser = argparse.ArgumentParser(description='Fetch and parse Claude Code changelog')
    parser.add_argument('--version', '-v', help='Get specific version release notes')
    parser.add_argument('--from', dest='from_ver', help='Start version for comparison')
    parser.add_argument('--to', dest='to_ver', help='End version for comparison')
    parser.add_argument('--list', '-l', type=int, metavar='N', help='List last N versions')
    parser.add_argument('--raw', '-r', action='store_true', help='Output raw changelog')

    args = parser.parse_args()

    content = fetch_changelog()

    if args.raw:
        print(content)
        return

    versions = parse_versions(content)

    if not versions:
        print("No versions found in changelog", file=sys.stderr)
        sys.exit(1)

    if args.list:
        print(f"Last {args.list} versions:")
        print(list_versions(versions, args.list))
    elif args.from_ver and args.to_ver:
        print(compare_versions(versions, args.from_ver, args.to_ver))
    elif args.version:
        info = get_version_info(versions, args.version)
        if info:
            print(info)
        else:
            print(f"Version {args.version} not found", file=sys.stderr)
            print(f"Available versions: {list_versions(versions, 5)}")
            sys.exit(1)
    else:
        # Default: show latest version
        latest = sorted(versions.keys(), key=lambda v: [int(x) for x in v.split('.')], reverse=True)[0]
        print(f"Latest version: {latest}\n")
        print(versions[latest])


if __name__ == '__main__':
    main()
