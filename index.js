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
    uris : [
    ],
    outputDir : '.',
    subtitles : { captions: ['zh-Hant','en-US'], subtitleType: 'srt', downThemAll: true },
    willSubtitle :  false,
    willVideo : false,
    qualityLabel: '360p',
    // "User-Agent" 由於含 "-" 號，不符合變量的定義，所以要用引號括起來。用於模擬瀏覽器的請求的 HTTP HEADER
    commonHeaders : {'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:72.0) Gecko/20100101 Firefox/72.0'},
};  // end options


const regWatchUrl = /^https:\/\/www\.youtube\.com\/watch\?v\=/i ;
const regListUrl = /https:\/\/www\.youtube\.com\/playlist\?list=/i ;


async function extractMediaInfoFromUrl(url) {
    if ((url==null)||(url==='')||(url.match(regWatchUrl)==null)) return null;

    let content = await miniget(url).text();
    let varStr = content.match(/var\s+ytInitialPlayerResponse\s*=\s*\{.+?\}\s*[;\n]/g);
    let infoObj = JSON.parse(varStr.toString().match(/\{.+\}/g).toString());

    return infoObj;
}


async function download(url) {
    fs.mkdirSync(options.outputDir, { recursive: true });

    let infoObj = await extractMediaInfoFromUrl(url);
    if (infoObj==null) return;

    for (let format of infoObj.streamingData.formats) {
	console.log(format.itag, format.qualityLabel);
    }
    let mediaFormat = infoObj.streamingData.formats[0];  ///TODO: default use the first one
    for (let format of infoObj.streamingData.formats) {
	if (format.qualityLabel === options.qualityLabel) {
	    mediaFormat = format;
	}
	///TODO: more options choose, e.g. choose container mp4 or webm
    }

    let mediaContainer = mediaFormat.mimeType.replace(/.*(video|audio)\/(.+)\;.*/g,'$2');
    console.log(infoObj.videoDetails.title);
    let reqHeaders = Object.assign({}, options.commonHeaders,{Range: `bytes=0-${mediaFormat.contentLength}`});
    console.log(reqHeaders);

    if (options.willSubtitle) {
	try {
	    let captionTracks = infoObj.captions.playerCaptionsTracklistRenderer.captionTracks;
	    for (let captionTrack of captionTracks) {
		let {baseUrl,languageCode} = captionTrack;
		if (options.subtitles.captions.includes(languageCode)) {
		    let outputFileName = path.join(options.outputDir,`${infoObj.videoDetails.title}.${languageCode}.xml`);
		    console.log(outputFileName);
		    let wstream = fs.createWriteStream(outputFileName);
		    let data = await miniget(baseUrl, options.commonHeaders);
		    data.pipe(wstream);
		    await new Promise(fulfill => wstream.on("finish", fulfill));  //wait for finishing download, then continue other in loop
		    console.log(`${outputFileName}\.${options.subtitles.subtitleType}`);
		    fs.writeFileSync(`${outputFileName}\.${options.subtitles.subtitleType}`, captionToSubtitle(outputFileName));
		}
	    }
	} catch (e) {
	    ///TODO: 沒有字幕則略過，忽視異常。
	}
    }

    if (options.willVideo) {
	let outputFileName = path.join(options.outputDir, `${infoObj.videoDetails.title}.${mediaContainer}`);
	console.log(outputFileName);
	let wstream = fs.createWriteStream(outputFileName);
	miniget(mediaFormat.url, reqHeaders).pipe(progressBar(':bar')).pipe(wstream);  // progressBar(':bar') can use only ':bar' ?
	await new Promise(fulfill => wstream.on("finish", fulfill));  //wait for finishing download, then continue other in loop
    }
}


async function extractUrlsFromList(url) {
    if ((url==null)||(url==='')||(url.match(regListUrl)==null)) return [];

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


async function app(opts) {
    if (opts == null) return;
//    options = opts;
    options = Object.assign(options, opts);
    console.log(options);
    for (let i=0; i<options.uris.length; i++) {
	if (options.uris[i].match(regWatchUrl)) {
	    await download(options.uris[i]);
	} else if (options.uris[i].match(regListUrl)) {
	    let uriArray = await extractUrlsFromList(options.uris[i]);
	    console.log(uriArray);
	    for await (let url of uriArray) {  //只想逐個下載
		console.log(url);
		await download(url);
	    }
	}
    }
}


function numberToTime(num) {
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

    let regSubtitle = /\<text\s+start\=\"([\d\.]+)\" dur\=\"([\d\.]+)\"\>([^(?:\<\/text\>)]+)\<\/text\>\s*/gi
    let subtitles = xml.match(regSubtitle);

    for (let i=0; i<subtitles.length; i++) {
	subtitles[i] = subtitles[i].replace(regSubtitle, `{"start": $1, "dur": $2, "text": "$3"}`);
    }

    for (let i=0; i<subtitles.length; i++) {
	let subtitleObj = JSON.parse(subtitles[i]);
	subtitles[i] = `${numberToTime(subtitleObj.start)} --> ${numberToTime(subtitleObj.start + subtitleObj.dur)}\n${subtitleObj.text}\n\n`;
    }

    for (let i=0; i<subtitles.length; i++) {
	retSubtitle += `${i+1}\n${subtitles[i]}`
    }

    return retSubtitle;
}


module.exports = {extractMediaInfoFromUrl, download, extractUrlsFromList, app, captionToSubtitle};