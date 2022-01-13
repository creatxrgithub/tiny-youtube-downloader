'use strict'


const {extractMediaInfoFromUrl, download, extractUrlsFromList, app, captionToSubtitle} = require('../repos/tiny-youtube-downloader/index.js');

//*
(async () => {
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
    }

    let testUrls = [
	'https://www.youtube.com/watch?v=hET2MS1tIjA'
    ];

    options.uris.push(...testUrls);
    options.outputDir = 'out';
    options.willSubtitle = true;
    options.willVideo = false;
    options.qualityLabel = '360p'
    options.subtitles.captions.push(...['en']);
    await app(options);

})();  //end top async()
//*/
