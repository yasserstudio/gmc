require "language/node"

# Homebrew formula for gmc. Lives in this repo's HomebrewFormula/ so the main repo
# doubles as the tap: `brew install yasserstudio/gmc/gmc`. It installs the published
# @gmc-cli/cli npm package and links the `gmc` binary (Homebrew provides Node).
#
# `url`/`sha256` point at the npm tarball for the released version; the release
# process updates them on each publish (the placeholder sha is filled at v1.0.0).
class Gmc < Formula
  desc "Typed, CI-friendly CLI for the Google Merchant API, with an offline feed-compliance preflight"
  homepage "https://yasserstudio.github.io/gmc/"
  url "https://registry.npmjs.org/@gmc-cli/cli/-/cli-1.0.0.tgz"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *Language::Node.std_npm_install_args(libexec)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "gmc", shell_output("#{bin}/gmc --help")
    assert_match version.to_s, shell_output("#{bin}/gmc --version")
  end
end
