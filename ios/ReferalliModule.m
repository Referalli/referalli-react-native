// Native half of @referalli/react-native on iOS: persistent storage in NSUserDefaults.
// Universal links and the deferred lookup are handled in JS (Linking + fetch); there is no
// install referrer on iOS, so getInstallInfo resolves nulls.
#import <React/RCTBridgeModule.h>

@interface ReferalliModule : NSObject <RCTBridgeModule>
@end

@implementation ReferalliModule

RCT_EXPORT_MODULE(ReferalliModule)

+ (BOOL)requiresMainQueueSetup { return NO; }

RCT_EXPORT_METHOD(getInstallInfo:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@{ @"referrer": [NSNull null], @"firstInstallTime": [NSNull null] });
}

RCT_EXPORT_METHOD(getItem:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
  resolve(value ?: [NSNull null]);
}

RCT_EXPORT_METHOD(setItem:(NSString *)key value:(NSString *)value resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] setObject:value forKey:key];
  resolve([NSNull null]);
}

RCT_EXPORT_METHOD(removeItem:(NSString *)key resolver:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:key];
  resolve([NSNull null]);
}

@end
