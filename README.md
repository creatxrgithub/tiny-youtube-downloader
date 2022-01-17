### 403 usually cause download too fast, 429 430 usually cause download too many. it may need proxy to change ip.
### it seems that it cannot catch miniget's 403 error.
```
'use strict'


const {extractMediaInfoFromUrl, download, extractUrlsFromList, app, captionToSubtitle} = require('tiny-youtube-downloader');

//*
(async () => {
    let options = {
	uris : [],
	outputDir : '.',
	subtitles : { captions: ['zh-Hant','en-US'], subtitleType: 'srt', downThemAll: true },
	willSubtitle : false,
	willVideo : false,
	preferQuality : { itag: 18, qualityLabel: '360p' },
	randomWait : { min: 12000, max: 12000 },  // slow down your batch downloads. otherwise it's easy get "403" error
	resumeDownload : true,
	maxFailture : 3,
	// "User-Agent" 由於含 "-" 號，不符合變量的定義，所以要用引號括起來。用於模擬瀏覽器的請求的 HTTP HEADER
	commonHeaders : {'User-Agent': 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:72.0) Gecko/20100101 Firefox/72.0'},  //add "agent" here
    }

    let testUrls = [
	'https://www.youtube.com/watch?v=hET2MS1tIjA',
	'https://www.youtube.com/playlist?list=PL2aBZuCeDwlRsa9T49dlm6vlZLfn1fSZ7'
    ];

    options.uris.push(...testUrls);
    options.outputDir = 'out';
    options.willSubtitle = true;
    options.willVideo = false;
    options.preferQuality.itag = 18;
    options.preferQuality.qualityLabel = '360p';
    options.subtitles.captions.push(...['en']);
    await app(options);

})();  //end top async()
//*/
```
