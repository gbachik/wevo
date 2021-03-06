//initial required libraries
var Promise = require("bluebird");
var request = Promise.promisifyAll(require('request'));
var User = require('../models/users.js');
var toTitleCase = function(str) {
    return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
};

function MusicSearch(artists, userId, res) {
	//ranked artists and tracks
	this.res = res;
	this.relatedFinished = 0;
	this.artists = artists;
	this.userId = userId;
	this.rankedArtists = {/*Artist: ranking*/};
	this.topTracks = {/*Artist: [top tracks]*/};
	this.initialArtists = [];
	this.intitialTracks = {/*Artist: [track names]*/};
	this.finalTrackList = [/*Track Name*/];
	this.videoIds = [/*Firt 10 video ids when everything is done*/];
}

MusicSearch.prototype.parseItems = function() {
	var self = this;
	var itemsArray = this.artists;
	if (!(itemsArray instanceof Array)) {
		var itemsArray = [itemsArray];
	}

	itemsArray.map(function(item, i, arr){
		arr[i] = arr[i].split('and').join('&');
		// arr[i] = arr[i].split('.').join('');
		// console.log('replaced: ', arr[i]);
	});

	itemsArray.map(function(item, index){
		var separated = item.split(' - ');
		var artist = separated.shift();
		var trackOrType = separated.pop();
		artist = toTitleCase(artist);
		if(artist in self.rankedArtists){
			self.rankedArtists[artist] += 1;
		}else{
			self.initialArtists.push(artist);
			self.rankedArtists[artist] = 1;
		}
		if (trackOrType.search('Artist') === -1 && trackOrType.search('Group') === -1) {
			self.intitialTracks[artist] = trackOrType;
		}
		//console.log("count:", count);
	});
	console.log(this.rankedArtists, this.intitialTracks);
}

MusicSearch.prototype.findRelatedArtists = function(){
	this.googleRelated();
	this.pandoraRelated();
	this.spotifyRelated();
	this.lastfmRelated();
	// this.freebaseRelated();
}

MusicSearch.prototype.googleRelated = function() {
	var self = this;
	var count = 0;
	this.initialArtists.map(function(artist, index){
		var bandname = artist;

		var fetchUrl = require("fetch").fetchUrl;
		var url = "https://www.google.de/search?q=";
		bandname = bandname.replace(" ", "+");

		fetchUrl(url+bandname, {
		headers: {
			'User-Agent' : 'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2049.0 Safari/537.36'
		}
		}, function(error, meta, body){
			var ret = [];
			var alts = body.toString().split('alt\\x3d\\x22');
			alts.forEach(function (alt) { var cur = alt.split("\\x22")[0]; if (cur.indexOf("(")==-1)    ret.push(cur) });
			ret.map(function(artist){
				var parsed = artist.split('+').join('');
				parsed = parsed.split('\\x26amp;').join('&');
				if (toTitleCase(parsed) in self.rankedArtists) {
					self.rankedArtists[toTitleCase(parsed)] += 1;
				}else{
					self.rankedArtists[toTitleCase(parsed)] = 0;
				}
			});
			count++
			if (count === self.initialArtists.length) {
				console.log("rankedArtists googleDone:", self.rankedArtists);
				self.relatedFinished++;
			}
			if (self.relatedFinished === 4) {
				self.getTopTracks();
			};
		});
	});
}

MusicSearch.prototype.pandoraRelated = function() {
	var self = this;
	var relatedArtisetCalls = [];
	this.initialArtists.map(function(artist, index){
		var defaultUrl = 'http://www.pandora.com/json/music/artist/';
		var nameFixed = artist.split('&').join('and');
		nameFixed = nameFixed.split(' ').join('-');
		var fixedUrl = defaultUrl + nameFixed + '?explicit=false';
		// console.log("fixedUrl:", fixedUrl);
		relatedArtisetCalls.push(request.getAsync(fixedUrl));
	});
	Promise.all(relatedArtisetCalls).spread(function() {
		[].map.call(arguments, function(res){
			var results = JSON.parse(res[0].body);
			if (Object.keys(results).length !== 0) {
				var similar = results.artistExplorer.similar;
				similar.map(function(artist){
					var parsed = artist['@name'].split('+').join('');
					if (toTitleCase(parsed) in self.rankedArtists) {
						self.rankedArtists[toTitleCase(parsed)] += 1;
					}else{
						self.rankedArtists[toTitleCase(parsed)] = 0;
					}
				});
			}else{
				console.log('Artist not found on pandora');
			}
			console.log("rankedArtists pandoraDone:", self.rankedArtists);
			self.relatedFinished++;
			if (self.relatedFinished === 4) {
				self.getTopTracks();
			};
		});
	}).catch(function(err) {
		console.error(err);
	});
}

MusicSearch.prototype.spotifyRelated = function() {
	var self = this;
	var artistIdCalls = [];
	this.initialArtists.map(function(artist, index){
		var nameFixed = artist.split('&').join('and');
		nameFixed = nameFixed.split(' ').join('-');

		var spotUrl = 'https://ws.spotify.com/search/1/';
		var appendString = 'artist.json?q=' + nameFixed;
		var fixedUrl = spotUrl + appendString;
		artistIdCalls.push(request.getAsync(fixedUrl).spread(function(res){
			var parsed = JSON.parse(res.body);
			return parsed.artists[0].href.split('spotify:artist:').join('');
		}));
	});
	Promise.all(artistIdCalls).then(function(results){
		var relatedArtisetCalls = [];
		results.map(function(artist){
			relatedArtisetCalls.push(request.getAsync('https://api.spotify.com/v1/artists/' + artist + '/related-artists'));
		});
		Promise.all(relatedArtisetCalls).then(function(results){
			results.map(function(result){
				var relatedArtists = JSON.parse(result[0].body);
				// console.log("relatedArtists:", relatedArtists);
				relatedArtists.artists.map(function(artist){
					var parsed = artist.name.split('+').join('');
					if (toTitleCase(parsed) in self.rankedArtists) {
						self.rankedArtists[toTitleCase(parsed)] += 1;
					}else{
						self.rankedArtists[toTitleCase(parsed)] = 0;
					}
				});
			});
			console.log("rankedArtists spotifyDone:", self.rankedArtists);
			self.relatedFinished++;
			if (self.relatedFinished === 4) {
				self.getTopTracks();
			};
		});
	});
}

MusicSearch.prototype.lastfmRelated = function() {
	var self = this;
	var relatedArtisetCalls = [];
	this.initialArtists.map(function(artist, index){
		relatedArtisetCalls.push(request.getAsync('http://ws.audioscrobbler.com/2.0/?method=artist.getsimilar&artist='+artist+'&api_key=048054556397dbbc3d4263b613e573f7&limit=20&format=json'));
	});
	Promise.all(relatedArtisetCalls).then(function(results){
		var related = JSON.parse(results[0][0].body);
		related.similarartists.artist.map(function(artist){
			var parsed = artist.name.split('+').join('');
			if (toTitleCase(parsed) in self.rankedArtists) {
				self.rankedArtists[toTitleCase(parsed)] += 1;
			}else{
				self.rankedArtists[toTitleCase(parsed)] = 0;
			}
		});
		console.log("rankedArtists lastfmDone:", self.rankedArtists);
		self.relatedFinished++;
		if (self.relatedFinished === 4) {
			self.getTopTracks();
		};
	});
}

// MusicSearch.prototype.freebaseRelated = function() {
// 	var self = this;
// 	var relatedArtisetCalls = [];
// 	this.initialArtists.map(function(artist, index){
// 		relatedArtisetCalls.push(request.getAsync('https://www.googleapis.com/freebase/v1/search?limit=7&query='+artist+'&type=%2Fmusic%2Fmusical_group&key=AIzaSyDcL_3c23SfRPdgIAaRcz-rSDmb62S1yDA'));
// 	});
// 	Promise.all(relatedArtisetCalls).then(function(results){
// 		var related = JSON.parse(results[0][0].body);
// 		console.log("related:", related);
// 		// related.similarartists.artist.map(function(artist){
// 		// 	if (toTitleCase(artist.name) in self.rankedArtists) {
// 		// 		self.rankedArtists[toTitleCase(artist.name)] += 1;
// 		// 	}else{
// 		// 		self.rankedArtists[toTitleCase(artist.name)] = 0;
// 		// 	}
// 		// });
// 		// console.log("rankedArtists freebaseDone:", self.rankedArtists);
// 	});
// }

MusicSearch.prototype.getTopTracks = function() {
	var self = this;
	var count = 0;
	var lastfmCalls = [];
	var spotifyCalls = [];
	var spotifyGetTopCalls = [];
	var needsAmpersand = [];
	for (artist in this.rankedArtists){
		if (artist.indexOf('&') !== -1) {
			artist = artist.split('&').join('And');
			needsAmpersand.push(artist);
		}
		lastfmCalls.push(request.getAsync('http://ws.audioscrobbler.com/2.0/?method=artist.gettoptracks&artist='+artist+'&api_key=048054556397dbbc3d4263b613e573f7&format=json&limit=5').spread(function(res, body){return body;}));
		spotifyCalls.push(request.getAsync('https://ws.spotify.com/search/1/artist.json?q='+artist).spread(function(res){
			if (res.body) {
				var parsed = JSON.parse(res.body);
				if (parsed.artists.length < 1) {
					return 'No Artist Found';
				}else{
					return parsed.artists[0].href.split('spotify:artist:').join('');
				}
			}
		}));
	}

	Promise.all(spotifyCalls).then(function(results){
		results.map(function(artist){
			if (artist !== 'No Artist Found') {	
				spotifyGetTopCalls.push(request.getAsync('https://api.spotify.com/v1/artists/'+artist+'/top-tracks?country=US').spread(function(res){return res.body;}));
			}
		});

		Promise.all(spotifyGetTopCalls).then(function(results){
			results.map(function(result){
				var parsed = JSON.parse(result);
				if (parsed.tracks) {
					if (parsed.tracks.length > 1) {
						parsed.tracks.map(function(track, index){
							track.artists[0].name = track.artists[0].name.split('+').join('');
							track.artists[0].name = track.artists[0].name.split('-').join(' ');
							if (needsAmpersand.indexOf(toTitleCase(track.artists[0].name)) !== -1) {
								track.artists[0].name = toTitleCase(track.artists[0].name).split('And').join('&');
							}
							if (index < 6) {
								if (toTitleCase(track.artists[0].name) in self.topTracks) {
									if (self.topTracks[toTitleCase(track.artists[0].name)].indexOf(toTitleCase(track.name)) === -1) {
										self.topTracks[toTitleCase(track.artists[0].name)].push(toTitleCase(track.name));
									}
								}else{
									self.topTracks[toTitleCase(track.artists[0].name)] = [toTitleCase(track.name)];
								}
							}
						});
					}else{
						console.log("Spotify found no top tracks for an artist");
					}
				}
			});
			count++;
			if (count === 2) {
				console.log("self.topTracks spotify:", self.topTracks);
				self.makeFinalTrackList();
			}
		});
	})

	Promise.all(lastfmCalls).then(function(body){
		body.map(function(result){
			var parsed = JSON.parse(result);
			if (parsed.toptracks !== undefined && 'track' in parsed.toptracks) {
				if (parsed.toptracks.track instanceof Array) {
					parsed.toptracks.track.map(function(track){
						track.artist.name = track.artist.name.split('+').join('');
						track.artist.name = track.artist.name.split('-').join(' ');
						if (needsAmpersand.indexOf(toTitleCase(track.artist.name)) !== -1) {
							track.artist.name = toTitleCase(track.artist.name).split('And').join('&');
						}
						if (toTitleCase(track.artist.name) in self.topTracks) {
							if (self.topTracks[toTitleCase(track.artist.name)].indexOf(toTitleCase(track.name)) === -1) {
								self.topTracks[toTitleCase(track.artist.name)].push(toTitleCase(track.name));
							}
						}else{
							self.topTracks[toTitleCase(track.artist.name)] = [toTitleCase(track.name)];
						}
					});
				}else{
					parsed.toptracks.track.artist.name = parsed.toptracks.track.artist.name.split('+').join('');
					parsed.toptracks.track.artist.name = parsed.toptracks.track.artist.name.split('-').join(' ');
					if (needsAmpersand.indexOf(toTitleCase(parsed.toptracks.track.artist.name)) !== -1) {
						track.artist.name = toTitleCase(parsed.toptracks.track.artist.name).split('And').join('&');
					}
					if (toTitleCase(parsed.toptracks.track.artist.name) in self.topTracks) {
						if (self.topTracks[toTitleCase(parsed.toptracks.track.artist.name)].indexOf(toTitleCase(parsed.toptracks.track.name)) === -1) {
							self.topTracks[toTitleCase(parsed.toptracks.track.artist.name)].push(toTitleCase(parsed.toptracks.track.name));
						}
					}else{
						self.topTracks[toTitleCase(parsed.toptracks.track.artist.name)] = [toTitleCase(parsed.toptracks.track.name)];
					}
				}
			}else{
				console.log("lastfm found no top tracks for an artist");
			}
		});
		count++;
		if (count === 2) {
			console.log("self.topTracks lastfm:", self.topTracks);
			self.makeFinalTrackList();
		}
	});
}

MusicSearch.prototype.makeFinalTrackList = function() {
	var self = this;
	var totalTracks = 0;
	var lowest = Infinity;
	var previousArtist = '';

	var getTotalTracks = function(){
		for (artist in self.topTracks){
			totalTracks += self.topTracks[artist].length;
		}
	};

	var fixRankedArtists = function(){
		for (artist in self.rankedArtists){
			if (self.rankedArtists[artist] < lowest) {
				lowest = self.rankedArtists[artist];
			}
		}
		for (artist in self.rankedArtists){
			if (lowest < 1) {
				self.rankedArtists[artist] += (-lowest +1);
			}
		}

	};

	var setFirstSong = function(){
		if (Object.keys(self.intitialTracks).length > 0) {
			//possibly delete duplicate from top tracks if you have time.
			var randomTrackIndex = Math.floor((Math.random() * Object.keys(self.intitialTracks).length));
			var artist = Object.keys(self.intitialTracks).splice(randomTrackIndex, 1);
			self.finalTrackList.push(artist +' - '+ self.intitialTracks[artist]);
		}else{
			var randomArtistIndex = Math.floor((Math.random() * self.initialArtists.length));
			var artist = self.initialArtists.splice(randomArtistIndex, 1);
			artist[0] = artist[0].split('-').join(' ');
			artist[0] = artist[0].split('+').join('');
			artist[0] = toTitleCase(artist[0]);
			var randomTrackIndex = Math.floor((Math.random() * self.topTracks[artist].length));
			self.finalTrackList.push(artist +' - '+ self.topTracks[artist].splice(randomTrackIndex, 1));
			previousArtist = artist;
			if (self.topTracks[artist].length === 0) {
				delete self.rankedArtists[artist];
			}
			totalTracks--;
		}
	};

	var setTracks = function(){
		for (var i = 0; i < totalTracks; i++) {
			var ratingSum = 0;
			var current = 0;
			var previous = 0;			
			var selection = Math.random() * 100;
			var rangedArtists = {};
			for (artist in self.rankedArtists){
				if (artist !== previousArtist && artist in self.topTracks){
					rangedArtists[artist] = self.rankedArtists[artist];
				}
			}
			for (artist in rangedArtists){
				ratingSum += rangedArtists[artist];
			}
			for (artist in rangedArtists){
				rangedArtists[artist] *= (100 / ratingSum);
			}
			for (artist in rangedArtists){
				current += rangedArtists[artist];
				if((previous < selection) && (selection < current)){
					// console.log("broken self.topTracks:", self.topTracks);
					// console.log("broken artist:", artist);
					var randomTrackIndex = Math.floor((Math.random() * self.topTracks[artist].length));
					self.finalTrackList.push(artist +' - '+ self.topTracks[artist].splice(randomTrackIndex, 1));
					previousArtist = artist;
					if (self.topTracks[artist].length === 0) {
						delete self.rankedArtists[artist];
					}
				}
				previous += rangedArtists[artist];
			}
		}
		console.log("self.topTracks:", self.topTracks);
	};

	getTotalTracks();
	fixRankedArtists();
	setFirstSong()
	setTracks();
	// console.log("topTracks:", this.topTracks);
	// console.log("finalTrackList:", this.finalTrackList, this.finalTrackList.length);
	this.getFirstTenYoutubeIds();
}

MusicSearch.prototype.getFirstTenYoutubeIds = function() {
	console.log('getFirstTenYoutubeIds:');
	var self = this;
	var firstTen = this.finalTrackList.splice(0,10);
	var youtubeIdCalls = [];
	// update user
	var query = {"_id": this.userId};
	var update = {currentPlaylist: this.finalTrackList};
	var options = {new: true};
	User.findOneAndUpdate(query, update, options, function(err, user) {
	  if (err) {
	    console.log('got an error');
	  }

	  // console.log("user:", user);
	});
	//end updating user
	firstTen.map(function(trackName){
		// console.log("firt ten trackName:", trackName);
		trackName = trackName.split(' ').join('+');
		youtubeIdCalls.push(request.getAsync('https://www.googleapis.com/youtube/v3/search?part=id&maxResults=1&q='+trackName+'&type=video&videoEmbeddable=true&key=AIzaSyDcL_3c23SfRPdgIAaRcz-rSDmb62S1yDA').spread(function(res, body){
			var body = JSON.parse(body);
			if ('items' in body) {
				if (body.items.length > 0) {
					return body.items[0].id.videoId;
				}
			}
		}));
	});

	Promise.all(youtubeIdCalls).then(function(videoIds){
		var videoIds = videoIds.filter(function(videoId){
			return videoId !== undefined;
		});
		var count = videoIds.length -1;
		console.log("videoIds:", videoIds);
		self.res.send({videoIds: videoIds, count: count});

	});
}

var musicController = {
	search: function(req, res) {
		var userId = req.params.userId;
		var artists = req.body["artists[]"];
		console.log("req.body:", req.body);
		console.log("Posted to musicSearch with userId:" + userId, "and artists list: " + artists);
		var currentSearch = new MusicSearch(artists, userId, res);
		currentSearch.parseItems();
		currentSearch.findRelatedArtists();
	}
};

module.exports = musicController;