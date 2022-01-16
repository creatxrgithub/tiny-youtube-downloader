'use strict'

/**
 * to download from youtube must have params: url and option {Range: `bytes=0-${mediaFormat.contentLength}`}.
 * it seems that ${mediaFormat.contentLength} is "undefined" if the size of media is less than 1 megabytes. but it still works.
 */

const fs = require('fs');
const path = require('path');
const miniget = require('miniget');
const progressBar = require('stream-progressbar');



let options = {
    uris : [],
    outputDir : '.',
    subtitles : { captions: ['zh-Hant','en-US','en'], subtitleType: 'srt', downThemAll: true },
    willSubtitle :  false,
    willVideo : false,
    preferQuality : { itag: 18, qualityLabel: '360p' },
    randomWait : { min: 12000, max: 12000 },
    resumeDownload : true,
    maxFailtures : 3,
    // "User-Agent" 由於含 "-" 號，不符合變量的定義，所以要用引號括起來。用於模擬瀏覽器的請求的 HTTP HEADER
    commonHeaders : {'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:72.0) Gecko/20100101 Firefox/72.0'},
};  // end options


const regWatchUrl = /^https:\/\/www\.youtube\.com\/watch\?v\=/i ;
const regListUrl = /^https:\/\/www\.youtube\.com\/playlist\?list=/i ;
const regIllegalFilename = /[\s\#\%\&\{\}\\\<\>\*\?\/\$\!\'\"\:\@\+\`\|\=]+/g;
const logNameError = 'downloads_errors.log';
const logNameRemain = 'downloads_remain.log';


async function extractMediaInfoFromUrl(url) {
    if ((url==null)||(url==='')||(url.match(regWatchUrl)==null)) return null;

    let content = await miniget(url).text();
    let varStr = content.match(/var\s+ytInitialPlayerResponse\s*=\s*\{.+?\}\s*[;\n]/g);
    let infoObj = JSON.parse(varStr.toString().match(/\{.+\}/g).toString());

    return infoObj;
}


async function download(url) {
    if ((url==='')||(url==null)) return;

    fs.mkdirSync(options.outputDir, { recursive: true });

    let infoObj = await extractMediaInfoFromUrl(url);
    if (infoObj==null) return;

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

    console.log(url);
    let mediaContainer = mediaFormat.mimeType.replace(/.*(video|audio)\/(.+)\;.*/g,'$2');
    console.log(infoObj.videoDetails.title);
    let reqHeaders = Object.assign({}, options.commonHeaders, {Range: `bytes=0-${mediaFormat.contentLength}`});
    console.log(reqHeaders);

    if (options.willSubtitle) {
	let captionTracks = infoObj.captions.playerCaptionsTracklistRenderer.captionTracks;
	for (let captionTrack of captionTracks) {
	    let {baseUrl,languageCode} = captionTrack;
	    if (options.subtitles.captions.includes(languageCode)) {
		let outputFileName = path.join(options.outputDir,`${infoObj.videoDetails.title}.${languageCode}.xml`.replace(regIllegalFilename,'_'));
		console.log(outputFileName);
		if (fs.existsSync(outputFileName)) {
		    console.log(`\x1b[33mskipping download: file exists "${outputFileName}".\x1b[0m`);
		} else {
		    let wstream = fs.createWriteStream(outputFileName);
		    let data = await miniget(baseUrl, options.commonHeaders);
		    data.pipe(wstream);
		    await new Promise(fulfill => wstream.on("finish", fulfill));  //wait for finishing download, then continue other in loop
		    console.log(`${outputFileName}\.${options.subtitles.subtitleType}`);
		    fs.writeFileSync(`${outputFileName}\.${options.subtitles.subtitleType}`, captionToSubtitle(outputFileName));
		}
	    }
	}
    }

    if (options.willVideo) {
	let outputFileName = path.join(options.outputDir, `${infoObj.videoDetails.title}.${mediaContainer}`.replace(regIllegalFilename,'_'));
	console.log(outputFileName);
	if (fs.existsSync(outputFileName)) {
	    console.log(`\x1b[33mskipping download: file exists "${outputFileName}".\x1b[0m`);
	} else {
	    let wstream = fs.createWriteStream(outputFileName);
	    miniget(mediaFormat.url, reqHeaders).pipe(progressBar(':bar')).pipe(wstream);  // progressBar(':bar') can use only ':bar' ?
	    await new Promise(fulfill => wstream.on("finish", fulfill));  //wait for finishing download, then continue other in loop
	}
    }
}


async function extractUrlsFromList(url) {
    if ((url==null)||(url==='')||(url.match(regListUrl)==null)) return [];
    /// TODO: only get urls in first page now. needs to get all the urls of the list.
    let content = await miniget(url).text();
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
//    options = opts;
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
	    console.log(`\x1b[31mcatch exception in app. log to file ${logFileName} ..............................\x1b[0m`);

	    let remainDownloads = path.join(options.outputDir, logNameRemain);
	    if (options.maxFailtures>=0) {
		options.maxFailtures -= 1;
		options.uris.unshift(uri);   /// it may put back to download list.
	    }
	    fs.writeFileSync(remainDownloads, options.uris.join('\n'),  {flag:'w'});
	    console.log(`\x1b[31msave remain download list to file ${remainDownloads} ..............................\x1b[0m`);

	    await timeout(12000);  // if get exception, wait for a while.
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
