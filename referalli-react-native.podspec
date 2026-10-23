require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "referalli-react-native"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = "https://referalli.com"
  s.license      = { :type => "MIT", :file => "LICENSE" }
  s.author       = "Referalli"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :git => "https://github.com/referalli/referalli-react-native.git", :tag => "v#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.resource_bundles = { "ReferalliPrivacy" => ["ios/PrivacyInfo.xcprivacy"] }

  if respond_to?(:install_modules_dependencies, true)
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
