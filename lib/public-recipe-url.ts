import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import http from 'node:http'
import https from 'node:https'

export type RecipePublicAddress = { address: string; family: number }
type Reply = { status: number; location?: string; body: string }
export type PublicRecipeFetchIo = {
  lookup: (hostname: string) => Promise<RecipePublicAddress[]>
  request: (url: URL, address: RecipePublicAddress, headers: Record<string, string>, timeoutMs: number, maxBytes: number) => Promise<Reply>
}
export function isPublicRecipeAddress(address: string) {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number)
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2)) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113)
  }
  if (isIP(address) === 6) {
    // Only global unicast. Reject mapped IPv4, local/multicast, documentation,
    // transition/tunnel and special-use ranges conservatively.
    const first = Number.parseInt(address.split(':')[0],16)
    const second = Number.parseInt(address.split(':')[1] || '0',16)
    return first >= 0x2000 && first < 0x3fff && first !== 0x2002 && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8))
  }
  return false
}
export function parsePublicRecipeUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) throw new Error('Please give a complete public recipe link.')
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw new Error('Please give a valid public recipe link.') }
  const host = url.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'')
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.port && !['80','443'].includes(url.port) || !host.includes('.') && !isIP(host) || /(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid)$/.test(host) || isIP(host) && !isPublicRecipeAddress(host)) throw new Error('Recipe links must use a public website without account credentials or local addresses.')
  url.hash = ''
  return url
}
function bounded<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve,reject)=>{
    const timer = setTimeout(()=>reject(new Error('The recipe website took too long to respond.')),timeoutMs)
    promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})
  })
}
async function pinnedRequest(url: URL, address: RecipePublicAddress, headers: Record<string,string>, timeoutMs: number, maxBytes: number): Promise<Reply> {
  return new Promise((resolve,reject)=>{
    const transport = url.protocol === 'https:' ? https : http
    const safeHeaders = Object.fromEntries(Object.entries(headers).filter(([key])=>['user-agent','accept','accept-language'].includes(key.toLowerCase())))
    const requestOptions: http.RequestOptions & { autoSelectFamily: boolean } = { method:'GET', headers:{...safeHeaders,'accept-encoding':'identity'}, agent:false, family:address.family, autoSelectFamily:false,
      // Preserve the original host for Host and TLS certificate validation while
      // connecting only to the already checked address. No second DNS lookup.
      lookup: ((_host: string, _opts: any, callback: any)=>callback(null,address.address,address.family)) as any,
    }
    const req = transport.request(url, requestOptions,response=>{
      const status = response.statusCode || 0
      if ([301,302,303,307,308].includes(status)) { response.destroy();resolve({status,location:response.headers.location,body:''});return }
      const size = Number(response.headers['content-length'])
      if (size > maxBytes) { response.destroy();req.destroy(new Error('The recipe page is too large.'));return }
      const chunks: Buffer[] = [];let bytes=0
      response.on('data',(chunk: Buffer)=>{bytes+=chunk.length;if(bytes>maxBytes){response.destroy();req.destroy(new Error('The recipe page is too large.'));return}chunks.push(chunk)})
      response.on('error',reject)
      response.on('end',()=>resolve({status,body:Buffer.concat(chunks).toString('utf8')}))
    })
    const timer = setTimeout(()=>req.destroy(new Error('The recipe website took too long to respond.')),timeoutMs)
    req.on('error',reject);req.on('close',()=>clearTimeout(timer));req.end()
  })
}
const defaultIo: PublicRecipeFetchIo = { lookup: host=>lookup(host,{all:true,verbatim:true}), request:pinnedRequest }
export async function validatePublicRecipeUrl(raw: unknown, io: PublicRecipeFetchIo = defaultIo, timeoutMs = 15000) {
  const url = parsePublicRecipeUrl(raw)
  const hostname = url.hostname.replace(/^\[|\]$/g,'')
  const addresses = isIP(hostname) ? [{address:hostname,family:isIP(hostname)}] : await bounded(io.lookup(hostname),timeoutMs)
  if (!addresses.length || addresses.some(item=>!isPublicRecipeAddress(item.address))) throw new Error('The recipe website does not have a safe public address.')
  return {url,address:addresses[0]}
}
export async function fetchPublicRecipeUrl(raw: unknown, options: {headers?:Record<string,string>;timeoutMs?:number;maxBytes?:number} = {}, io: PublicRecipeFetchIo = defaultIo) {
  const deadline = Date.now() + Math.max(1,Math.min(options.timeoutMs ?? 15000,30000))
  const maxBytes = Math.max(1,Math.min(options.maxBytes ?? 2000000,2000000))
  let next = raw
  for (let redirects=0;redirects<=4;redirects++) {
    const remaining = deadline-Date.now()
    if (remaining<=0) throw new Error('The recipe website took too long to respond.')
    const checked = await validatePublicRecipeUrl(next,io,remaining)
    const reply = await bounded(io.request(checked.url,checked.address,options.headers || {},Math.max(1,deadline-Date.now()),maxBytes),Math.max(1,deadline-Date.now()))
    if ([301,302,303,307,308].includes(reply.status)) {
      if (!reply.location || redirects===4) throw new Error('The recipe website redirected too many times.')
      next = new URL(reply.location,checked.url).toString();continue
    }
    if (Buffer.byteLength(reply.body,'utf8')>maxBytes) throw new Error('The recipe page is too large.')
    return {ok:reply.status>=200&&reply.status<300,status:reply.status,url:checked.url.toString(),text:async()=>reply.body}
  }
  throw new Error('The recipe website redirected too many times.')
}
