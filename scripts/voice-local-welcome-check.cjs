#!/usr/bin/env node
'use strict'
// Actual pure welcome controller, actual plugin and native bridge source.
// Synthetic player/file adapters only; no provider, microphone, audio or builds.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript')
const root=path.resolve(__dirname,'..'), file='native/src/voice/localVoiceWelcome.ts', moduleBox={exports:{}}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleBox,exports:moduleBox.exports})
const {createLocalVoiceWelcome,LOCAL_VOICE_WELCOME_TEXT}=moduleBox.exports
const tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()}
function fixture(options={}) {
  let current=true,listener,removed=0,finishAsset,finishPlay
  const stages=[],playing=[],completed=[],notices=[],plays=[],stops=[]
  const io={playbackId:'synthetic-welcome-id',isCurrent:()=>current,assetUri:()=>options.pendingAsset?new Promise(resolve=>{finishAsset=resolve}):Promise.resolve(options.uri||'file:///synthetic/cache/helfi-welcome.mp3'),
    player:options.missing?null:{playVoiceWelcome:async(uri,id)=>{plays.push({uri,id});if(options.fail)throw Error('Synthetic native failure');if(options.pendingPlay)return new Promise(resolve=>{finishPlay=resolve});return true},stopVoiceWelcome:async id=>{stops.push(id)}},
    listen:callback=>{listener=callback;return{remove:()=>{removed++;listener=null}}},onStage:value=>stages.push(value),onPlaying:value=>playing.push(value),onComplete:value=>completed.push(value),onUnavailable:value=>notices.push(value)}
  const api=createLocalVoiceWelcome(io)
  return{api,stages,playing,completed,notices,plays,stops,emit:(status,extra={})=>listener?.({playbackId:io.playbackId,status,...extra}),removed:()=>removed,current:value=>{current=value},asset:()=>finishAsset('file:///synthetic/cache/helfi-welcome.mp3'),play:()=>finishPlay(true)}
}
let count=0
async function check(name,run){await run();count++;console.log('PASS '+name)}
async function main(){
  await check('actual native start and successful completion alone produce one exact welcome transcript',async()=>{const f=fixture();await f.api.start();await f.api.start();assert.equal(f.plays.length,1);assert.equal(f.completed.length,0);assert.equal(f.playing.length,0);f.emit('started');f.emit('started');assert.equal(f.api.isPlaying(),true);assert.deepEqual(f.playing,[true]);f.emit('finished',{completed:true});f.emit('finished',{completed:true});assert.deepEqual(f.completed,[LOCAL_VOICE_WELCOME_TEXT]);assert.deepEqual(f.playing,[true,false]);assert.equal(f.removed(),1);await f.api.start();assert.equal(f.plays.length,1)})
  await check('user-first before start never loads or plays a welcome',async()=>{const f=fixture();await f.api.stop('user-first');await f.api.start();assert.equal(f.plays.length,0);assert.equal(f.completed.length,0)})
  await check('End/user/tool/account cancellation during asset load wins over late file completion',async()=>{for(const reason of ['ended','user-first','tool','account-changed']){const f=fixture({pendingAsset:true});const run=f.api.start();await tick();await f.api.stop(reason);f.asset();await run;assert.equal(f.plays.length,0);assert.equal(f.completed.length,0);assert.equal(f.removed(),1)}})
  await check('stop while native playback is pending stops its late start without a false transcript',async()=>{const f=fixture({pendingPlay:true});const run=f.api.start();await tick();await f.api.stop('ended');f.emit('started');f.play();await run;assert.equal(f.plays.length,1);assert(f.stops.length>=1);assert.equal(f.completed.length,0);assert.equal(f.api.isPlaying(),false)})
  await check('barge-in/tool/End stops a playing clip and never records it as completed',async()=>{for(const reason of ['user-first','tool','ended']){const f=fixture();await f.api.start();f.emit('started');await f.api.stop(reason);f.emit('finished',{completed:true});assert.deepEqual(f.playing,[true,false]);assert.equal(f.completed.length,0);assert.equal(f.stops.length,1)}})
  await check('old iOS/unsupported platform missing bridge and failed playback give truthful notices',async()=>{for(const options of [{missing:true},{fail:true},{uri:'https://not-a-bundled-file.invalid/audio.mp3'}]){const f=fixture(options);await f.api.start();assert.equal(f.completed.length,0);assert.equal(f.notices.length,1);assert(f.notices[0].includes('You can start speaking.'))}const f=fixture();await f.api.start();f.emit('started');f.emit('failed');await tick();assert.equal(f.notices.length,1);assert.equal(f.completed.length,0)})
  await check('stale native IDs/inactive account/incomplete finish cannot claim a played greeting',async()=>{const f=fixture();await f.api.start();f.emit('started',{playbackId:'old-native-id'});f.emit('finished',{completed:true});assert.equal(f.completed.length,0);f.emit('started');f.current(false);f.emit('finished',{completed:true});assert.equal(f.completed.length,0);await f.api.stop('account-changed');assert.equal(f.removed(),1)})
  await check('bundled real UI-generated asset exactly matches recorded provenance and welcome text',async()=>{const crypto=require('node:crypto'),asset=fs.readFileSync(path.join(root,'native/assets/audio/helfi-welcome.mp3')),proof=JSON.parse(fs.readFileSync(path.join(root,'docs/release-evidence/2026-10-17/helfi-welcome-asset-provenance.json'),'utf8'));assert.equal(proof.text,LOCAL_VOICE_WELCOME_TEXT);assert.equal(proof.voice,'marin');assert.equal(asset.length,proof.bytes);assert.equal(crypto.createHash('sha256').update(asset).digest('hex'),proof.sha256);assert.equal(proof.physicalSpeakerAudibilityVerified,false)})
  await check('canonical native bridge matches actual project, plays once under RTC without category/activation changes',async()=>{const bridge=fs.readFileSync(path.join(root,'native/ios/Helfi/HelfiAudioRoute.m'),'utf8'),template=fs.readFileSync(path.join(root,'native/plugins/helfi-audio-route/HelfiAudioRoute.m'),'utf8');assert.equal(bridge,template);const welcome=bridge.slice(bridge.indexOf('- (void)finishWelcome:'),bridge.indexOf('- (NSString *)currentRouteName'));for(const required of ['AVAudioPlayer alloc','player.numberOfLoops = 0','player.delegate = self','[player play]','playbackId','audioPlayerDidFinishPlaying','stopVoiceWelcome','completed:flag','NSCachesDirectory','url.isFileURL'])assert(welcome.includes(required),required);assert(!/setActive:|setCategory:|setConfiguration:|setMode:/.test(welcome));assert(bridge.includes('[strongSelf finishWelcome:@"interrupted" completed:NO]'));assert(bridge.includes('[self finishWelcome:@"stopped" completed:NO]'))})
  await check('actual plugin copies the canonical bridge and delegates exact source linking with a synthetic Expo project boundary',async()=>{
    // Server CI installs only root packages. This executes the real plugin;
    // the synthetic Expo boundary is not a test of Expo's Xcode parser/linker.
    // Actual native compilation and project parsing are separate build checks.
    const pluginFile=path.join(root,'native/plugins/with-helfi-audio-route.js')
    for(const projectName of ['Helfi','SyntheticApp',undefined])for(const alreadyLinked of [false,true]){
      const name=projectName||'Helfi',relative=`${name}/HelfiAudioRoute.m`
      const destination=path.join('/synthetic/ios',relative),template=path.join(root,'native/plugins/helfi-audio-route/HelfiAudioRoute.m')
      const copied=[],directories=[],links=[],checks=[],additions=[]
      const files=new Set(alreadyLinked?[relative]:[])
      const project={configuration:{buildNumber:'synthetic-preserved',otherSource:'Unrelated.m'},
        hasFile:filepath=>{checks.push(filepath);return files.has(filepath)},
        addSourceFile:(filepath,options,groupName)=>{assert.equal(options.target,'synthetic-target');assert.equal(groupName,name);assert(!files.has(filepath));files.add(filepath);additions.push(filepath)}}
      const before=JSON.stringify(project.configuration),module={exports:{}}
      let registration
      const config={marker:'preserved-config'},withXcodeProject=(value,callback)=>{assert.equal(value,config);registration=callback;return value}
      const addBuildSourceFileToGroup=options=>{
        assert.deepEqual(Object.keys(options).sort(),['filepath','groupName','project'])
        assert.equal(options.filepath,relative);assert.equal(options.groupName,name);assert.equal(options.project,project)
        links.push(options.filepath)
        // Model only the external helper's source-membership contract; the
        // actual plugin must forward this exact project/path on every run.
        if(!project.hasFile(options.filepath))project.addSourceFile(options.filepath,{target:'synthetic-target'},options.groupName)
        return project
      }
      vm.runInNewContext(fs.readFileSync(pluginFile,'utf8'),{module,exports:module.exports,__dirname:path.dirname(pluginFile),require:request=>{
        if(request==='node:fs')return{mkdirSync:(directory,options)=>{assert.equal(options.recursive,true);directories.push(directory)},copyFileSync:(from,to)=>copied.push({from,to,hash:require('node:crypto').createHash('sha256').update(fs.readFileSync(from)).digest('hex')})}
        if(request==='node:path')return path
        if(request==='@expo/config-plugins')return{withXcodeProject,IOSConfig:{XcodeUtils:{addBuildSourceFileToGroup}}}
        throw Error(`Unexpected plugin import: ${request}`)
      }})
      assert.equal(module.exports(config),config);assert.equal(typeof registration,'function')
      const current={modRequest:{...(projectName?{projectName}:{}),platformProjectRoot:'/synthetic/ios'},modResults:project,marker:'preserved-mod'}
      assert.equal(registration(current),current);assert.equal(registration(current),current)
      assert.deepEqual(links,[relative,relative]);assert.deepEqual(checks,[relative,relative]);assert.deepEqual(additions,alreadyLinked?[]:[relative])
      assert.deepEqual(directories,[path.dirname(destination),path.dirname(destination)])
      const canonicalHash=require('node:crypto').createHash('sha256').update(fs.readFileSync(template)).digest('hex')
      assert.deepEqual(copied,[{from:template,to:destination,hash:canonicalHash},{from:template,to:destination,hash:canonicalHash}])
      assert.equal(JSON.stringify(project.configuration),before)
    }
    const app=JSON.parse(fs.readFileSync(path.join(root,'native/app.json'),'utf8'))
    assert(app.expo.plugins.includes('./plugins/with-helfi-audio-route'));assert.match(app.expo.ios.buildNumber,/^\d+$/)
  })
  await check('checked-in actual Xcode project contains exactly one canonical bridge reference and linked source membership',async()=>{
    const project=fs.readFileSync(path.join(root,'native/ios/Helfi.xcodeproj/project.pbxproj'),'utf8')
    const section=name=>{const start=project.indexOf(`/* Begin ${name} section */`),end=project.indexOf(`/* End ${name} section */`);assert(start>=0&&end>start,`Missing ${name}`);return project.slice(start,end)}
    const references=[...section('PBXFileReference').matchAll(/([A-F0-9]{24}) \/\* HelfiAudioRoute\.m \*\/ = \{[^\n]*path = Helfi\/HelfiAudioRoute\.m;[^\n]*\};/g)]
    assert.equal(references.length,1);const reference=references[0][1]
    const builds=[...section('PBXBuildFile').matchAll(new RegExp(`([A-F0-9]{24}) /\\* HelfiAudioRoute\\.m in Sources \\*/ = \\{isa = PBXBuildFile; fileRef = ${reference} /\\* HelfiAudioRoute\\.m \\*/; \\};`,'g'))]
    assert.equal(builds.length,1);const build=builds[0][1]
    assert.equal(section('PBXGroup').split(`${reference} /* HelfiAudioRoute.m */`).length-1,1)
    assert.equal(section('PBXSourcesBuildPhase').split(`${build} /* HelfiAudioRoute.m in Sources */`).length-1,1)
    const crypto=require('node:crypto'),digest=relative=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex')
    assert.equal(digest('native/ios/Helfi/HelfiAudioRoute.m'),digest('native/plugins/helfi-audio-route/HelfiAudioRoute.m'))
  })
  console.log(`PASS ${count} local welcome controller/bridge/plugin groups. No audible or native binary claim.`)
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1})
