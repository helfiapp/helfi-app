#import <AVFoundation/AVFoundation.h>
#import <React/RCTEventEmitter.h>
#import <WebRTC/RTCAudioSession.h>
#import <WebRTC/RTCAudioSessionConfiguration.h>

@interface HelfiAudioRoute : RCTEventEmitter <RCTBridgeModule, AVAudioPlayerDelegate>
@property(nonatomic, strong) id routeObserver;
@property(nonatomic, strong) id interruptionObserver;
@property(nonatomic, strong) AVAudioPlayer *welcomePlayer;
@property(nonatomic, copy) NSString *welcomePlaybackId;
@end

@implementation HelfiAudioRoute

RCT_EXPORT_MODULE(HelfiAudioRoute)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"HelfiAudioRouteChanged", @"HelfiVoiceWelcomePlayback"];
}

- (void)finishWelcome:(NSString *)status completed:(BOOL)completed
{
  NSString *playbackId = self.welcomePlaybackId;
  AVAudioPlayer *player = self.welcomePlayer;
  self.welcomePlayer = nil;
  self.welcomePlaybackId = nil;
  player.delegate = nil;
  [player stop];
  if (playbackId.length > 0) {
    [self sendEventWithName:@"HelfiVoiceWelcomePlayback"
                      body:@{@"playbackId": playbackId, @"status": status, @"completed": @(completed)}];
  }
  // WebRTC owns AVAudioSession. Stopping this player never changes its category,
  // mode, activation or audio focus, so microphone and remote audio stay live.
}

RCT_REMAP_METHOD(playVoiceWelcome,
                 playVoiceWelcome:(NSString *)uri
                 playbackId:(NSString *)playbackId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSURL *url = [NSURL URLWithString:uri];
    NSString *filePath = url.URLByStandardizingPath.path;
    NSString *bundlePath = NSBundle.mainBundle.bundlePath;
    NSString *cachePath = NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES).firstObject;
    BOOL inBundle = [filePath hasPrefix:[bundlePath stringByAppendingString:@"/"]];
    BOOL inCache = cachePath.length > 0 && [filePath hasPrefix:[cachePath stringByAppendingString:@"/"]];
    if (!url.isFileURL || (!inBundle && !inCache) || playbackId.length == 0 || playbackId.length > 100) {
      reject(@"welcome_source_invalid", @"The bundled opening welcome is unavailable.", nil);
      return;
    }
    [self finishWelcome:@"stopped" completed:NO];
    NSError *error = nil;
    AVAudioPlayer *player = [[AVAudioPlayer alloc] initWithContentsOfURL:url error:&error];
    if (!player || ![player prepareToPlay]) {
      reject(@"welcome_load_failed", @"The opening welcome could not be loaded.", nil);
      return;
    }
    player.delegate = self;
    player.numberOfLoops = 0;
    player.volume = 1.0;
    self.welcomePlayer = player;
    self.welcomePlaybackId = playbackId;
    if (![player play]) {
      [self finishWelcome:@"failed" completed:NO];
      reject(@"welcome_play_failed", @"The opening welcome could not be played.", nil);
      return;
    }
    [self sendEventWithName:@"HelfiVoiceWelcomePlayback"
                      body:@{@"playbackId": playbackId, @"status": @"started", @"completed": @NO}];
    resolve(@YES);
  });
}

RCT_REMAP_METHOD(stopVoiceWelcome,
                 stopVoiceWelcome:(NSString *)playbackId
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(__unused RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if ([self.welcomePlaybackId isEqualToString:playbackId]) [self finishWelcome:@"stopped" completed:NO];
    resolve(@YES);
  });
}

- (void)audioPlayerDidFinishPlaying:(AVAudioPlayer *)player successfully:(BOOL)flag
{
  if (player == self.welcomePlayer) [self finishWelcome:flag ? @"finished" : @"failed" completed:flag];
}

- (void)audioPlayerDecodeErrorDidOccur:(AVAudioPlayer *)player error:(__unused NSError *)error
{
  if (player == self.welcomePlayer) [self finishWelcome:@"failed" completed:NO];
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
      if (interrupted) [strongSelf finishWelcome:@"interrupted" completed:NO];
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
  [self finishWelcome:@"stopped" completed:NO];
  if (self.routeObserver) [NSNotificationCenter.defaultCenter removeObserver:self.routeObserver];
  if (self.interruptionObserver) [NSNotificationCenter.defaultCenter removeObserver:self.interruptionObserver];
  self.routeObserver = nil;
  self.interruptionObserver = nil;
}

@end
