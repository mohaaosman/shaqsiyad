# frozen_string_literal: true

require_relative "lib/shaqsiyad/version"

Gem::Specification.new do |spec|
  spec.name = "shaqsiyad"
  spec.version = Shaqsiyad::VERSION
  spec.summary = "Client for the Shaqsiyad API: fictional people with faces, ethnicity, faith, careers and connections."
  spec.description = "Seedable fictional people for demos, tests, mockups and agents. Standard library only."
  spec.authors = ["Shaqsiyad"]
  spec.license = "MIT"
  spec.homepage = "https://github.com/mohaaosman/shaqsiyad"
  spec.metadata = {
    "source_code_uri" => "https://github.com/mohaaosman/shaqsiyad/tree/main/packages/ruby",
    "rubygems_mfa_required" => "true"
  }
  spec.required_ruby_version = ">= 3.1"
  spec.files = Dir["lib/**/*.rb"] + ["README.md"]
  spec.require_paths = ["lib"]
end
