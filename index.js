'use strict'

/**
 * to download from youtube must have params: url and option {Range: `bytes=0-${mediaFormat.contentLength}`}.
 * it seems that ${mediaFormat.contentLength} is "undefined" if the size of media is less than 1 megabytes. but it still works.
 */

const fs = require('fs');
const path = require('path');
//const miniget = require('miniget');
const progressBar = require('stream-progressbar');
const needle = require('needle');
const querystring = require('querystring');



let options = {
	uris : [],
	outputDir : '.',
	subtitles : { captions: [], subtitleType: 'srt', downThemAll: true },
	willSubtitle :  false,
	willVideo : false,
	preferQuality : { itag: 18, qualityLabel: '360p' },
	randomWait : { min: 12000, max: 120000 },
	resumeDownload : true,
	maxFailtures : 3,
	// "User-Agent" 由於含 "-" 號，不符合變量的定義，所以要用引號括起來。用於模擬瀏覽器的請求的 HTTP HEADER
	commonHeaders : { 'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:72.0) Gecko/20100101 Firefox/72.0' },
	httpMethods : { httpGetBody: null, httpGetRaw: null, httpGetStream: null }
};  // end options


const regWatchUrl = /^https:\/\/www\.youtube\.com\/watch\?v\=/i ;
const regListUrl = /^https:\/\/www\.youtube\.com\/playlist\?list=/i ;
const regIllegalFilename = /[\s\#\%\&\{\}\\\<\>\*\?\/\$\!\'\"\:\@\+\`\|\=]+/g;
const regAntiBot = /https\:\/\/www\.google\.com\/recaptcha\/api\.js/gi;  /// TODO: <form action="/das_captcha?fw=1" method="POST">
const logNameError = 'downloads_errors.log';
const logNameRemain = 'downloads_remain.log';

///TODO: miniget(url, { agent: new ProxyAgent(proxyUri) }) https://www.npmjs.com/package/proxy-agent
function detectAntiBot(content) {
	if (content.match(regAntiBot)==null) {
		return false;
	} else {
		return true;
	}
}


/**
 * @return body
 */
async function httpGetBody(url, headers=options.commonHeaders) {
	//const { got } = import('got');  // to use es6 module with import() function here.
	//attention: it's not work with code "return await needle('get', url, headers).body;"
	let res = await needle('get', url, headers);
	if (res.headers['set-cookie'] !== undefined) {
		options.commonHeaders.cookie = res.headers['set-cookie'];
	}
	console.log(options.commonHeaders);
	return res.body;
}
/**
 * @return raw data
 */
async function httpGetRaw(url, headers=options.commonHeaders) {
	//attention: it's not work with code "return await needle('get', url, headers).raw;"
	let res = await needle('get', url, headers);
	return res.raw;
}
/**
 * @return stream for pipe large media
 */
function httpGetStream(url, headers=options.commonHeaders) {
	return needle.get(url, headers);
}


async function extractMediaInfoFromUrl(url, headers=options.commonHeaders) {
	if ((url==null)||(url==='')||(url.match(regWatchUrl)==null)) return null;
	let callback = httpGetBody;
	if (typeof options.httpMethods.httpGetBody === 'function') {
		callback = options.httpMethods.httpGetBody;
	}
	let content = await callback(url, headers);
	if (detectAntiBot(content)) process.exit(0);
	let varStr = content.match(/var\s+ytInitialPlayerResponse\s*=\s*\{.+?\}\s*[;\n]/g);
	let infoObj = JSON.parse(varStr.toString().match(/\{.+\}/g).toString());
	return infoObj;
}


async function download(url, headers=options.commonHeaders) {
	if ((url==='')||(url==null)) return;
	fs.mkdirSync(options.outputDir, { recursive: true });
	let infoObj = await extractMediaInfoFromUrl(url);
	if (infoObj==null) return;
	//console.debug(infoObj);
	if (infoObj.playabilityStatus.status === 'LOGIN_REQUIRED') {
		console.log('LOGIN_REQUIRED');
		return;
	}
	for (let format of infoObj.streamingData.formats) {
		console.log(format.itag, format.qualityLabel);
	}
	let mediaFormat = infoObj.streamingData.formats[0];  /// TODO: default use the first one
	for (let format of infoObj.streamingData.formats) {
		if (format.itag === options.preferQuality.itag) {
			mediaFormat = format;
			break;  // choose match of itag. 360p is 18.
		}
		if (format.qualityLabel === options.preferQuality.qualityLabel) {
			mediaFormat = format;
			break;  // choose first match, e.g. '360p'
		}
		/// TODO: more options choose, e.g. choose container mp4 or webm
	}
	if (Object.hasOwn(infoObj.streamingData, 'adaptiveFormats')) {
		for (let format of infoObj.streamingData.adaptiveFormats) {
			if (format.itag === options.preferQuality.itag) {
				mediaFormat = format;
				break;  // choose match of itag. 360p is 18.
			}
			if (format.qualityLabel === options.preferQuality.qualityLabel) {
				mediaFormat = format;
				break;  // choose first match, e.g. '360p'
			}
		}
	}

	console.log(url);
	let mediaContainer = mediaFormat.mimeType.replace(/.*(video|audio)\/(.+)\;.*/g,'$2');
	console.log(infoObj.videoDetails.title);
	let reqHeaders = Object.assign({}, headers, {Range: `bytes=0-${mediaFormat.contentLength}`});
	console.log(reqHeaders);
	if (options.willSubtitle) {
		try {
			//if (infoObj.captions.playerCaptionsTracklistRenderer.captionTracks === undefined) {
			//if (!Object.hasOwn(infoObj,'captions.playerCaptionsTracklistRenderer.captionTracks')) {
				//console.log('\x1b[33m', 'no subtitles', '\x1b[0m');
			//} else {
				let captionTracks = infoObj.captions.playerCaptionsTracklistRenderer.captionTracks;
				for (let captionTrack of captionTracks) {
					let {baseUrl,languageCode} = captionTrack;
					if (options.subtitles.captions.includes(languageCode)) {
						let outputFileName = path.join(options.outputDir,`${infoObj.videoDetails.title}.${languageCode}.xml`.replace(regIllegalFilename,'_'));
						console.log(outputFileName);
						if (fs.existsSync(outputFileName) && (fs.statSync(outputFileName).size>0)) {
							console.log('\x1b[33m', `skipping download: file exists "${outputFileName}".`, '\x1b[0m');
						} else {
							let callback = httpGetRaw;
							if (typeof options.httpMethods.httpGetRaw === 'function') {
								callback = options.httpMethods.httpGetRaw;
							}
							let data = await callback(baseUrl, headers);
							fs.writeFileSync(outputFileName, data);
							console.log(baseUrl);
							console.log(`${outputFileName}\.${options.subtitles.subtitleType}`);
							fs.writeFileSync(`${outputFileName}\.${options.subtitles.subtitleType}`, captionToSubtitle(outputFileName));
						}
					}
				}
			//}
		} catch (e) {
			if (e.name === 'TypeError') {
				//console.log(e.name);
				console.log('\x1b[33m', 'no subtitles', '\x1b[0m')
			} else {
				throw e;
			}
		}
	}
	if (options.willVideo) {
		let outputFileName = path.join(options.outputDir, `${infoObj.videoDetails.title}.${mediaContainer}`.replace(regIllegalFilename,'_'));
		console.log(outputFileName);
		if (fs.existsSync(outputFileName) && (fs.statSync(outputFileName).size>0)) {
			console.log('\x1b[33m', `skipping download: file exists "${outputFileName}".`, '\x1b[0m');
		} else {
			console.log(mediaFormat);
			let videoUrl = mediaFormat.url;
			if (videoUrl === undefined) {
				let obj = querystring.parse(mediaFormat.signatureCipher);
				videoUrl = obj.url;  //unable to download by it
			}
			let wstream = fs.createWriteStream(outputFileName);
			let callback = httpGetStream;
			if (typeof options.httpMethods.httpGetStream === 'function') {
				callback = options.httpMethods.httpGetStream;
			}
			let stream = callback(videoUrl, reqHeaders);
			//let stream = callback(mediaFormat.url, reqHeaders);
			//console.log(mediaFormat.url);
			stream.pipe(progressBar(':bar')).pipe(wstream);
			stream.on('done', () => { console.log(outputFileName); });
			await new Promise(fulfill => wstream.on("finish", fulfill));  //wait for finishing download, then continue other in loop
		}
	}
}


async function extractUrlsFromList(url, headers=options.commonHeaders) {
	if ((url==null)||(url==='')||(url.match(regListUrl)==null)) return [];
	/// TODO: only get urls in first page now. needs to get all the urls of the list.
	let callback = httpGetBody;
	if (typeof options.httpMethods.httpGetBody === 'function') {
		callback = options.httpMethods.httpGetBody;
	}
	let content = await callback(url, headers);
	if (detectAntiBot(content)) process.exit(0);
	let varStr = content.match(/var\s+ytInitialData\s*=\s*\{.+?\}\s*[;\n]/g);
	let infoObj = JSON.parse(varStr.toString().match(/\{.+\}/g).toString());
	let reg = /\"url\":\"\/watch\?v\=[^\"]+\&list=[^\"]+\&index\=\d+\"/gi;
	let urls = JSON.stringify(infoObj).match(reg);
	let retArray = [];
	let baseUrl = 'https://www.youtube.com';
	for (let url of urls) {
		retArray.push(baseUrl + url.replace(/\"url\":\"(\/watch\?v\=[^\"]+)\&list=.*/g,'$1'));
	}
	return retArray;
}


function timeout(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function random(min, max) {
	if (min>max) [min,max] =[max,min];
	return Math.floor(Math.random() * max) + min;
}

async function app(opts) {
	if (opts == null) return;
	/// TODO: deep copy object. 深度拷貝對象，沒有則使用默認値。
	options = Object.assign(options, opts);  // 由於不是深度拷貝，如果存在 { subtitles: {} } 則會丟失默認値
	options.maxFailtures = Number.isNaN(options.maxFailtures) ? 3 : options.maxFailtures;
	console.log(options);
	if (options.resumeDownload==true) {
		let logRemain = path.join(options.outputDir,logNameRemain);
		if (fs.existsSync(logRemain)) {
			let remainDownloads = fs.readFileSync(logRemain, 'utf8');
			options.uris = remainDownloads.split(/\s+/g).concat(options.uris);
			//options.uris = remainDownloads.split(/\s+/g);
		}
	}
	while (options.uris.length>0) {
		console.log("downloads remain:", options.uris.length);
		let uri = options.uris.shift();
		try {
			if (uri.match(regWatchUrl)) {
			/// TODO: 控制並行下載的數量，及各個下載的進程顯示。control parallel downloads and progress bar
				await download(uri);
			} else if (uri.match(regListUrl)) {
				let uriArray = await extractUrlsFromList(uri);
				console.log(uriArray);
				options.uris = uriArray.concat(options.uris);  //or use "options.uris.push(...uriArray);" add to the end
				continue;
			}
		} catch (e) {
			console.log(e);
			let logFileName = path.join(options.outputDir, logNameError);
			fs.writeFileSync(logFileName, `${uri}\n${e}\n\n`, {flag:'a'});
			console.log('\x1b[31m', `catch exception in app. log to file ${logFileName} ..............................`, '\x1b[0m');

			let remainDownloads = path.join(options.outputDir, logNameRemain);
			if (options.maxFailtures>=0) {
				options.maxFailtures -= 1;
				options.uris.unshift(uri);   /// it may put back to download list.
			}
			//fs.writeFileSync(remainDownloads, options.uris.join('\n'),  {flag:'w'});
			fs.writeFileSync(remainDownloads, options.uris.join('\n'));
			console.log('\x1b[31m', `save remain download list to file ${remainDownloads} ..............................`, '\x1b[0m');
			//await timeout(12000);  // if get exception, wait for a while.
			process.exit(0);  /// TODO:
		}
		// 放慢速度，隨機等待時間 random wait to slow down
		if (options.randomWait != null) {
			if ((!Number.isNaN(options.randomWait.min)) && (!Number.isNaN(options.randomWait.max))) {
				await timeout(random(options.randomWait.min,options.randomWait.max));
			}
		}
	}
}


function secondsToTime(num) {
	let minutes = Math.floor(num / 60);
	let hours = minutes >60 ? Math.floor(minutes / 60) : 0;
	minutes = minutes > 60 ? Math.floor(minutes % 60) : minutes;
	let seconds = num%60;
	let milliseconds = seconds.toString().replace(/\d+.?(\d)*/,'$1');
	milliseconds = milliseconds == null ? 0 : milliseconds.toString().slice(0,2);
	seconds = seconds.toString().replace(/(\d+).?\d*/,'$1').padStart(2,'0');
	minutes = minutes.toString().padStart(2,'0');
	hours = hours.toString().padStart(2,'0');
	return `${hours}:${minutes}:${seconds},${milliseconds}`;
}



function captionToSubtitle(xmlStringOrFileName) {
	/// TODO: only convert xml to srt for now.
	let retSubtitle = '';
	let xml = xmlStringOrFileName;
	if (fs.existsSync(xmlStringOrFileName)) {
		xml = fs.readFileSync(xmlStringOrFileName, 'utf8');
	}
	let regSubtitle = /\<text\s+start\=\"([\d\.]+)\" dur\=\"([\d\.]+)\"\>(.*?)\<\/text\>\s*/gi
	let subtitles = xml.match(regSubtitle);
	for (let i=0; i<subtitles.length; i++) {
		subtitles[i] = subtitles[i].replace(regSubtitle, `{"start": $1, "dur": $2, "text": "$3"}`);
	}
	for (let i=0; i<subtitles.length; i++) {
		let subtitleObj = JSON.parse(subtitles[i]);
		subtitles[i] = `${secondsToTime(subtitleObj.start)} --> ${secondsToTime(subtitleObj.start + subtitleObj.dur)}\n${subtitleObj.text}\n\n`;
	}
	for (let i=0; i<subtitles.length; i++) {
		retSubtitle += `${i+1}\n${subtitles[i]}`;
	}
	retSubtitle = retSubtitle.replace(/\&amp\;\#39\;/g, '\'');  // it seems that only that "\&amp\;\#39\;"
	return retSubtitle;
}


module.exports = {extractMediaInfoFromUrl, download, extractUrlsFromList, app, captionToSubtitle};
