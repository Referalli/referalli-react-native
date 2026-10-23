/* global module */
// Autolinking: Android module from android/, iOS module from the podspec.
module.exports = {
  dependency: {
    platforms: {
      android: {
        packageImportPath: 'import com.referalli.reactnative.ReferalliPackage;',
        packageInstance: 'new ReferalliPackage()',
      },
    },
  },
};
