#!/bin/sh
# Installs the drivine command line: Cypher from your shell, against Neo4j, Memgraph, FalkorDB, Postgres, Oracle or
# SQLite.
#
#     curl -fsSL https://drivine.org/install.sh | sh
#
# It picks the native binary for this machine from drivine4j's latest GitHub release, checks it against the SHA-256
# the release publishes beside it, refuses it if they differ, and puts `drivine` in ~/.local/bin. Read it before you
# run it: `curl -fsSL https://drivine.org/install.sh -o install.sh`.
#
# Settings, as environment variables (put them after the pipe: `curl ... | DRIVINE_VERSION=0.9.1 sh`):
#   DRIVINE_VERSION      a release to install, such as 0.9.1, in place of the latest
#   DRIVINE_INSTALL_DIR  where to put `drivine`, in place of ~/.local/bin
#   DRIVINE_RELEASES     where the releases are, in place of https://github.com/liberation-data/drivine4j/releases:
#                        a mirror with the same layout, <releases>/latest/download/<file> and
#                        <releases>/download/v<version>/<file>
#
# Native binaries are built for macOS on Apple silicon and Linux on x64. On any other machine, run the CLI's JVM build
# with JBang instead, which needs nothing else installed: https://www.jbang.dev
set -eu

releases=${DRIVINE_RELEASES:-https://github.com/liberation-data/drivine4j/releases}
install_dir=${DRIVINE_INSTALL_DIR:-${HOME:?HOME is not set: set DRIVINE_INSTALL_DIR}/.local/bin}
version=${DRIVINE_VERSION:-}
version=${version#v}

say() { printf 'drivine: %s\n' "$*" >&2; }
fail() { say "$*"; exit 1; }

no_binary() {
    say "there's no native drivine binary for $1 yet: they're built for macOS on Apple silicon and Linux on x64."
    say "Run the CLI with JBang instead, which needs nothing else installed (https://www.jbang.dev):"
    say "    jbang drivine@liberation-data/drivine4j --help"
    exit 1
}

os=$(uname -s)
arch=$(uname -m)
case "$os" in
    Darwin)
        # A shell under Rosetta says x86_64 on Apple silicon, which runs the arm64 binary natively.
        if [ "$arch" = x86_64 ] && [ "$(sysctl -n sysctl.proc_translated 2>/dev/null || true)" = 1 ]; then
            arch=arm64
        fi
        case "$arch" in
            arm64 | aarch64) asset=drivine-macos-arm64.zip ;;
            *) no_binary "macOS on $arch" ;;
        esac
        ;;
    Linux)
        case "$arch" in
            x86_64 | amd64) asset=drivine-linux-x64.tar.gz ;;
            *) no_binary "Linux on $arch" ;;
        esac
        ;;
    *) no_binary "$os on $arch" ;;
esac

if [ -n "$version" ]; then
    url="$releases/download/v$version/$asset"
else
    url="$releases/latest/download/$asset"
fi

if command -v curl > /dev/null 2>&1; then
    fetch() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget > /dev/null 2>&1; then
    fetch() { wget -q -O "$2" "$1"; }
else
    fail "this needs curl or wget to download the binary."
fi

if command -v sha256sum > /dev/null 2>&1; then
    sha256() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum > /dev/null 2>&1; then
    sha256() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
    fail "this needs sha256sum or shasum to check the download."
fi

tmp=$(mktemp -d 2>/dev/null || mktemp -d -t drivine)
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' HUP INT TERM

say "downloading $url"
fetch "$url" "$tmp/$asset" || fail "couldn't download $url${version:+: is $version a drivine4j release with the CLI attached?}"
fetch "$url.sha256" "$tmp/$asset.sha256" || fail "couldn't download $url.sha256, the checksum to check the binary against."

# The .sha256 is as sha256sum writes it: the digest, two spaces, the file's name.
# A carriage return, from a .sha256 written on Windows, isn't part of the digest.
expected=$(tr -d '\r' < "$tmp/$asset.sha256" | cut -d ' ' -f 1 | tr 'A-F' 'a-f')
actual=$(sha256 "$tmp/$asset")
case "$expected" in
    *[!0-9a-f]* | '') fail "$url.sha256 doesn't hold a SHA-256, so the binary can't be checked. Nothing was installed." ;;
esac
[ "${#expected}" -eq 64 ] || fail "$url.sha256 doesn't hold a SHA-256, so the binary can't be checked. Nothing was installed."
if [ "$expected" != "$actual" ]; then
    fail "the download's SHA-256 is $actual, but the release says $expected. Nothing was installed."
fi

mkdir "$tmp/unpacked"
case "$asset" in
    *.zip)
        # ditto, on macOS, unpacks as Finder does; unzip elsewhere.
        if command -v ditto > /dev/null 2>&1; then
            ditto -x -k "$tmp/$asset" "$tmp/unpacked" || fail "couldn't unpack $asset. Nothing was installed."
        elif command -v unzip > /dev/null 2>&1; then
            unzip -q "$tmp/$asset" -d "$tmp/unpacked" || fail "couldn't unpack $asset. Nothing was installed."
        else
            fail "this needs unzip to unpack $asset."
        fi
        ;;
    *.tar.gz) tar -xzf "$tmp/$asset" -C "$tmp/unpacked" || fail "couldn't unpack $asset. Nothing was installed." ;;
esac
[ -f "$tmp/unpacked/drivine" ] || fail "$asset holds no drivine binary. Nothing was installed."

mkdir -p "$install_dir" || fail "couldn't make $install_dir: set DRIVINE_INSTALL_DIR to a folder you can write to."
chmod 755 "$tmp/unpacked/drivine"
# Moved in under a name of its own first, then renamed over the old one, so a drivine that's running isn't cut short.
mv "$tmp/unpacked/drivine" "$install_dir/.drivine.new" || fail "couldn't write to $install_dir: set DRIVINE_INSTALL_DIR to a folder you can write to."
mv -f "$install_dir/.drivine.new" "$install_dir/drivine"

# Its stdin is /dev/null: under `curl ... | sh` the shell's stdin is the rest of this script.
if ! installed=$("$install_dir/drivine" --version < /dev/null 2>&1); then
    say "installed $install_dir/drivine, but it doesn't run here:"
    printf '%s\n' "$installed" >&2
    say "On Linux, a glibc older than the one it was built on stops it. JBang runs the CLI's JVM build anywhere:"
    say "    jbang drivine@liberation-data/drivine4j --help"
    exit 1
fi
say "installed $installed at $install_dir/drivine"

case ":${PATH:-}:" in
    *":$install_dir:"*) ;;
    *) say "$install_dir isn't on your PATH: add it to your shell's profile, e.g. export PATH=\"$install_dir:\$PATH\"" ;;
esac
