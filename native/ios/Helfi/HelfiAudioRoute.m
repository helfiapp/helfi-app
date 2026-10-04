#import <AVFoundation/AVFoundation.h>
#import <React/RCTEventEmitter.h>
#import <WebRTC/RTCAudioSession.h>
#import <WebRTC/RTCAudioSessionConfiguration.h>

@interface HelfiAudioRoute : RCTEventEmitter <RCTBridgeModule>
@property(nonatomic, strong) id routeObserver;
@property(nonatomic, strong) id interruptionObserver;
@end

@implementation HelfiAudioRoute

RCT_EXPORT_MODULE(HelfiAudioRoute)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"HelfiAudioRouteChanged"];
}

- (NSString *)currentRouteName
{
  AVAudioSessionRouteDescription *route = AVAudioSession.sharedInstance.currentRoute;
  AVAudioSessionPortDescription *output = route.outputs.firstObject;
  NSString *portType = output.portType ?: @"";
  if ([portType isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
      [portType isEqualToString:AVAudioSessionPortBluetoothHFP] ||
      [portType isEqualToString:AVAudioSessionPortBluetoothLE]) {
    return output.portName.length > 0 ? output.portName : @"Bluetooth";
  }
  if ([portType isEqualToString:AVAudioSessionPortHeadphones] ||
      [portType isEqualToString:AVAudioSessionPortHeadsetMic] ||
      [portType isEqualToString:AVAudioSessionPortUSBAudio]) {
    return output.portName.length > 0 ? output.portName : @"Headphones";
  }
  if ([portType isEqualToString:AVAudioSessionPortBuiltInSpeaker]) return @"iPhone speaker";
  if ([portType isEqualToString:AVAudioSessionPortBuiltInReceiver]) return @"iPhone earpiece";
  return output.portName.length > 0 ? output.portName : @"iPhone audio";
}

- (BOOL)configureVoiceAudio:(NSError **)error
{
  RTCAudioSessionConfiguration *configuration = [RTCAudioSessionConfiguration webRTCConfiguration];
  AVAudioSessionCategoryOptions options = AVAudioSessionCategoryOptionDefaultToSpeaker |
                                          AVAudioSessionCategoryOptionAllowBluetoothHFP;
  configuration.category = AVAudioSessionCategoryPlayAndRecord;
  configuration.mode = AVAudioSessionModeVoiceChat;
  configuration.categoryOptions = options;
  [RTCAudioSessionConfiguration setWebRTCConfiguration:configuration];

  RTCAudioSession *session = RTCAudioSession.sharedInstance;
  [session lockForConfiguration];
  session.useManualAudio = NO;
  BOOL configured = [session setConfiguration:configuration error:error];
  [session unlockForConfiguration];
  return configured;
}

- (NSDictionary *)voiceAudioState
{
  AVAudioSession *session = AVAudioSession.sharedInstance;
  AVAudioSessionPortDescription *input = session.currentRoute.inputs.firstObject;
  return @{
    @"route": [self currentRouteName],
    @"input": input.portName ?: @"",
    @"category": session.category ?: @"",
    @"mode": session.mode ?: @"",
    @"inputAvailable": @(session.inputAvailable),
    @"recordPermission": @(session.recordPermission),
    @"inputChannels": @(session.inputNumberOfChannels),
    @"outputChannels": @(session.outputNumberOfChannels),
    @"sampleRate": @(session.sampleRate),
  };
}

RCT_REMAP_METHOD(configureForVoice,
                 configureForVoiceWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSError *error = nil;
    if (![self configureVoiceAudio:&error]) {
      reject(@"audio_route_failed", @"The iPhone audio route could not be prepared.", error);
      return;
    }
    resolve([self currentRouteName]);
  });
}

RCT_REMAP_METHOD(getVoiceAudioState,
                 getVoiceAudioStateWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve([self voiceAudioState]);
  });
}

- (void)startObserving
{
  __weak HelfiAudioRoute *weakSelf = self;
  self.routeObserver = [NSNotificationCenter.defaultCenter
    addObserverForName:AVAudioSessionRouteChangeNotification
    object:AVAudioSession.sharedInstance
    queue:NSOperationQueue.mainQueue
    usingBlock:^(__unused NSNotification *notification) {
      HelfiAudioRoute *strongSelf = weakSelf;
      if (!strongSelf) return;
      [strongSelf sendEventWithName:@"HelfiAudioRouteChanged"
                               body:[[strongSelf voiceAudioState] mutableCopy]];
    }];
  self.interruptionObserver = [NSNotificationCenter.defaultCenter
    addObserverForName:AVAudioSessionInterruptionNotification
    object:AVAudioSession.sharedInstance
    queue:NSOperationQueue.mainQueue
    usingBlock:^(NSNotification *notification) {
      HelfiAudioRoute *strongSelf = weakSelf;
      if (!strongSelf) return;
      NSNumber *rawType = notification.userInfo[AVAudioSessionInterruptionTypeKey];
      BOOL interrupted = rawType.unsignedIntegerValue == AVAudioSessionInterruptionTypeBegan;
      if (!interrupted) {
        NSError *error = nil;
        [strongSelf configureVoiceAudio:&error];
      }
      NSMutableDictionary *state = [[strongSelf voiceAudioState] mutableCopy];
      state[@"interrupted"] = @(interrupted);
      [strongSelf sendEventWithName:@"HelfiAudioRouteChanged" body:state];
    }];
}

- (void)stopObserving
{
  if (self.routeObserver) [NSNotificationCenter.defaultCenter removeObserver:self.routeObserver];
  if (self.interruptionObserver) [NSNotificationCenter.defaultCenter removeObserver:self.interruptionObserver];
  self.routeObserver = nil;
  self.interruptionObserver = nil;
}

@end
