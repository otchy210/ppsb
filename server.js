// globals
var HTTP_PORT = 10080;
var WS_PORT = 10088;
var DEBUG = true;
var VIEW_DIR = './view/'
var STATIC_DIR = './static/'
var DATA_DIR = './.data/'

// requires
var fs = require('fs');
var ejs = require('ejs');
var qs = require('querystring');

// initialize
(function() {
	try {
		var stats = fs.statSync(DATA_DIR);
	} catch (e) {}
	if (!!stats && stats.isFile()) throw DATA_DIR + ' must be directory.';
	if (!!stats && stats.isDirectory()) return;
	fs.mkdirSync(DATA_DIR);
	fs.mkdirSync(DATA_DIR + 'match');
	fs.mkdirSync(DATA_DIR + 'player');
})();

// common
var log = function() {console.log.apply(console, arguments)};

var debug = (function() {
	if (DEBUG) {
		return log;
	} else {
		return function(){};
	}
})();

String.prototype.startsWith = function (str){
	return this.indexOf(str) == 0;
};

String.prototype.endsWith = function(suffix) {
	return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var isStatic = function(path) {
	return path.match(/\.(html|css|js|json)$/);
}

var isEmpty = function(str) {
	return !str || str.length == 0;
}

var isValidInt = function(str) {
	return str.match(/^[0-9]+$/);
}

var isValidPlayer = function(str) {
	return str.match(/^[a-zA-Z0-9_-]+$/);
}

var common = require('./static/js/common.js');	// shared with browser

// http response
var return200 = function(res, text, type) {
	var type = (type == undefined) ? 'text/html' : type;
	res.writeHead(200, {
		'Content-Type': type,
		'Content-Length': Buffer.byteLength(text, 'utf8')
	});
	res.write(text);
	res.end();
}

var redirect302 = function(res, location) {
	res.writeHead(302, {'Location': location});
	res.write('302 Found');
	res.end();
};

var error404 = function(res) {
	res.writeHead(404, {'Content-Type': 'text/plain'});
	res.write('404 Not Found');
	res.end();
};

var error500 = function(res) {
	res.writeHead(500, {'Content-Type': 'text/plain'});
	res.write('500 Internal Server Error');
	res.end();
}

// views
var View = function(path) {
	var self = this;
	self.path = path;
	self.template = fs.readFileSync(VIEW_DIR + path, 'utf8');
	self.render = function(data) {
		return ejs.render(
			self.template, 
			data,
			{filename: VIEW_DIR + path}
		);
	};
	self.write = function(res, data, type) {
		var text = self.render(data);
		return200(res, text, type);
	};
};
var views = (function(){
	var views = {};
	fs.readdir(VIEW_DIR, function(err, files) {
		if (err) throw err;
		files.filter(function(file) {
			return file.endsWith('.ejs');
		}).forEach(function(file) {
			var key = file.substr(0, file.length - 4);
			views[key] = new View(file);
		})
	});
	return views;
})();

// JsonFile
var JsonFile = function(path, defaultData) {
	var self = this;
	self.path = DATA_DIR + path + '.json';
	try {
		self.data = JSON.parse(fs.readFileSync(self.path), 'utf8');
	} catch (e) {
		self.data = defaultData;
	}
	self.save = function() {
		try {
			fs.writeFileSync(self.path, JSON.stringify(self.data));
			debug('Save to ' + self.path);
		} catch (e) {
			log(e);
		}
	};
	self.hasData = function() {
		return !!self.data;
	};
}

// utils
var buildActiveMatches = function() {
	var list = new JsonFile('match/list', []);
	var actives = [];
	for (var i = list.data.length - 1; i >= 0; i--) {
		var match = list.data[i];
		if (match.status === undefined || match.status === 'ongoing') {
			actives.push(match);
		}
	}
	return actives;
}

var updateMatchList = function(match) {
	var data = match.data;
	var index = data.id - 1;
	var list = new JsonFile('match/list', []);
	if (list.data.length <= index) {
		return;
	}
	var item = list.data[index];
	if (data.status) {
		item['status'] = data.status;
	} else {
		delete item['status'];
	}
	if (!isEmpty(data.won)) {
		item['won'] = data.won;
	} else {
		delete item['won'];
	}
	list.save();
}

var buildWsUri = function(req) {
	var host = req.headers.host;
	var index = host.indexOf(':');
	host = (index >= 0) ? host.substr(0, index) : host;
	return 'ws://' + host + ':' + WS_PORT + '/';
}

// controllers
var handleStatic = function(context) {
	var res = context.res;
	var path = context.path;
	var dir = STATIC_DIR;
	var type = (function() {
		if (path.endsWith('.html')) {
			return 'text/html';
		}
		if (path.endsWith('.css')) {
			return 'text/css';
		}
		if (path.endsWith('.js')) {
			return 'text/javascript';
		}
		if (path.endsWith('.json')) {
			dir = DATA_DIR;
			return 'application/json';
		}
	})();
	fs.readFile(dir + path, 'utf8', function(err, text) {
		if (err) {
			log(err);
			error404(res);
			return;
		}
		return200(res, text, type);
	});
}

var handleIndex = function(context) {
	var matchesList = new JsonFile('match/list', []);
	matchesList = matchesList.data.reverse().slice(0, 10).map(
		function(item) {
			item['created-str'] = common.formatDate(new Date(item['created']));
			return item;
		}
	);
	views['index'].write(context.res, {
		matches: buildActiveMatches(),
		matchesList: matchesList
	});
}

var handleMatchList = function(context) {
	var matchesList = new JsonFile('match/list', []);
	var machesTotal = matchesList.data.length
	var index = !context.params['index'] ? 0 : parseInt(context.params['index']);
	matchesList = matchesList.data.reverse().slice(index * 20, index * 20 + 20).map(
		function(item) {
			item['created-str'] = common.formatDate(new Date(item['created']));
			return item;
		}
	);
	views['match-list'].write(context.res, {
		matches: buildActiveMatches(),
		matchesList: matchesList,
		matchesTotal: machesTotal,
		currentIndex: index,
		maxIndex: Math.floor(machesTotal / 20)
	});
}

var handlePlayerList = function(context) {
	views['player-list'].write(context.res, {
		matches: buildActiveMatches()
	});
}

var handleMatchNew = function(context) {
	var req = context.req;
	var players = new JsonFile('player/list', []);
	if (req.method === 'GET') {
		views['match-edit'].write(context.res, {
			errors: {},
			params: {point: '11', deuce: '1', game: '1'},
			players: JSON.stringify(players.data.map(function(player) {return player.name})),
			matches: buildActiveMatches()
		});
		return;
	}
	var errors = {};
	var params = context.params;
	['point', 'game', 'player-a', 'player-b'].forEach(function(key) {
		if (isEmpty(params[key])) {
			errors[key] = true;
		}
	});
	['point', 'game'].forEach(function(key) {
		if (!errors[key] && !isValidInt(params[key])) {
			errors[key] = 'Invalid value.';
		}
	});
	['player-a', 'player-b'].forEach(function(key) {
		if (!errors[key] && !isValidPlayer(params[key])) {
			errors[key] = 'Alphabets and digits are only allowed.';
		}
	});
	if (Object.keys(errors).length > 0) {
		views['match-edit'].write(context.res, {
			errors: errors,
			params: params,
			players: JSON.stringify(players.data.map(function(player) {return player.name})),
			matches: buildActiveMatches()
		});
		return;
	}
	var matches = new JsonFile('match/list', []);
	var aName = params['player-a'];
	var bName = params['player-b'];
	var match = {
		id: matches.data.length + 1,
		title: params['title'] ? params['title'] : params['player-a'] + ' vs. ' + params['player-b'],
		point: parseInt(params['point']),
		deuce: params['deuce'] ? true : false,
		game: parseInt(params['game']),
		'player-a': aName,
		'player-b': bName,
		created: (new Date()).getTime(),
		result: [],
		'current-game': 1,
		'current-point-a': 0,
		'current-point-b': 0,
		status: 'pending'
	};
	matches.data.push({
		id: match.id,
		title: match.title,
		'player-a': aName,
		'player-b': bName,
		created: match.created
	});
	matches.save();
	(new JsonFile('match/' + match.id, match)).save();

	var playerNames = {};
	players.data.forEach(function(player) {
		playerNames[player.name] = true;
	});
	var newPlayer = false;
	[aName, bName].forEach(function(name) {
		if(!playerNames[name]) {
			var player = new JsonFile('player/' + name, {name: name});
			player.save();
			players.data.push(player.data);
			newPlayer = true;
		}
	});
	if (newPlayer) {
		players.data.sort(function(left, right) {
			var lName = left.name.toLowerCase();
			var rName = right.name.toLowerCase();
			if (lName > rName) return 1;
			if (lName < rName) return -1;
			return 0;
		});
		players.save();
	}
	redirect302(context.res, '/match/display/' + match.id + '/');
}

var getMatchData = function(context) {
	var paths = context.paths;
	if (paths.length !== 3 || !isValidInt(paths[2])) {
		error404(context.res);
		return;
	}
	var id = paths[2];
	var match = new JsonFile('match/' + id);
	if (!match.hasData()) {
		error404(context.res);
		return;
	}
	return match;
}

var handleMatchDisplay = function(context) {
	var match = getMatchData(context);
	if (!match) return;

	var subtitle = (function() {
		if (match.data['started']) {
			return common.formatDate(new Date(match.data['started']));	
		}
		return 'Waiting for judge';
	})();
	var formattedResult = [];
	for (var i=0; i<match.data.result.length; i++) {
		var result = match.data.result[i];
		formattedResult.push([
			common.formatPoint(match.data.result[i].scores[0]),
			common.formatPoint(match.data.result[i].scores[1])
		]);
	}
	views['match-display'].write(context.res, {
		match: match.data,
		currentPointA: common.formatPoint(match.data['current-point-a']),
		currentPointB: common.formatPoint(match.data['current-point-b']),
		formattedResult: formattedResult,
		subtitle: subtitle,
		wsUri: buildWsUri(context.req),
		currentMatch: JSON.stringify(match.data)
	});
}

var handleMatchJudge = function(context) {
	var match = getMatchData(context);
	if (!match) return;

	var req = context.req;
	if (req.method === 'GET') {
		views['match-judge'].write(context.res, {
			errors: {},
			params: {},
			match: match.data,
			matches: buildActiveMatches(),
			wsUri: buildWsUri(context.req),
			currentMatch: JSON.stringify(match.data)
		});
		return;
	}

	var errors = {};
	var params = context.params;
	var serve = params['serve'];
	if (serve === undefined || !(serve === 'a' || serve === 'b') ) {
		errors['serve'] = true;
	}
	if (Object.keys(errors).length > 0) {
		views['match-judge'].write(context.res, {
			errors: errors,
			params: params,
			match: match.data,
			matches: buildActiveMatches()
		});
		return;
	}
	match.data['serve'] = params['serve'];
	match.data['current-serve'] = params['serve'];
	match.data['status'] = 'ongoing';
	match.data['started'] = (new Date()).getTime();
	updateMatchList(match);
	match.save();

	wsServer.clients.forEach(function(client) {
		try {
			client.send(JSON.stringify(match.data));
		} catch (e) {
			log(e);
		}
	});

	redirect302(context.res, '/match/judge/' + match.data.id + '/');
}

var copyMatchResult = function(match) {
	var result = [];
	for (var i=0; i<match.data.result.length; i++) {
		result.push(match.data.result[i]);
	}
	return result;
}

var buildMatchStat = function(match) {
	return {
		result: copyMatchResult(match),
		'current-game': match.data['current-game'],
		'current-point-a': match.data['current-point-a'],
		'current-point-b': match.data['current-point-b'],
		'won': match.data['won'],
		'status': match.data['status']
	};
}

var getAnotherPlayer = function(player) {
	return (player === 'a') ? 'b' : 'a';
}

var getCurrentServe = function(data) {
	var firstServe = (data['current-game'] % 2 === 1) ? data['serve'] : getAnotherPlayer(data['serve']);
	var pointA = data['current-point-a'];
	var pointB = data['current-point-b'];
	var totalPoints = pointA + pointB;
	if (Math.min(pointA, pointB) >= data.point - 1) {
		var reverse = (totalPoints % 2 === 1);
	} else {
		var alterPoints = (data['point'] == 11) ? 2 : 5;
		var reverse = (Math.floor(totalPoints / alterPoints) % 2 === 1);
	}
	return reverse ? getAnotherPlayer(firstServe) : firstServe;
}

var handleAddPoint = function(player, match, matchStats) {
	var data = match.data;
	if (data.status === 'finished' || data.status === 'cancelled') {
		return match;
	}
	var stats = matchStats[data.id];
	if (!stats) {
		stats = [];
		matchStats[data.id] = stats;
	}
	stats.push(buildMatchStat(match));
	data['current-point-' + player] += 1;
	var anotherPlayer = getAnotherPlayer(player);
	var point = data['current-point-' + player];
	var anotherPoint = data['current-point-' + anotherPlayer];
	if (point >= data.point && (!data.deuce || (point - anotherPoint) > 1)) {
		var result = {
			won: player,
			scores: [data['current-point-a'], data['current-point-b']]
		};
		data.result.push(result);
		data['current-point-a'] = 0;
		data['current-point-b'] = 0;
		data['current-game'] += 1;
	}
	var games = {};
	var matchWonBy;
	for (var i=0; i<data.result.length; i++) {
		var result = data.result[i];
		var p = result.won;
		if (!games[p]) {
			games[p] = 1;
		} else {
			games[p]++;
		}
		if (games[p] >= data.game) {
			matchWonBy = p
			break;
		}
	}
	if (matchWonBy) {
		data['status'] = 'finished';
		data['won'] = matchWonBy;
		data['current-point-a'] = data.result[data.result.length - 1].scores[0];
		data['current-point-b'] = data.result[data.result.length - 1].scores[1];
		data['current-game'] -= 1;
		updateMatchList(match);
	}
	data['current-serve'] = getCurrentServe(data);
	match.save();
	return match;
}

var handleUndo = function(match, matchStats) {
	var data = match.data;
	var stats = matchStats[data.id];
	if (!stats || stats.length == 0) {
		return match;
	}
	var needsToUpdateList = (data.status === 'finished' || data.status === 'cancelled');
	var prevStats = stats.pop();
	for (var k in prevStats) {
		data[k] = prevStats[k];
	}
	data['current-serve'] = getCurrentServe(data);
	if (needsToUpdateList) {
		updateMatchList(match);
	}
	match.save();
	return match;
}

var handleCancel = function(match, matchStats) {
	var data = match.data;
	if (data.status === 'finished' || data.status === 'cancelled') {
		return match;
	}
	var stats = matchStats[data.id];
	if (!stats) {
		stats = [];
		matchStats[data.id] = stats;
	}
	stats.push(buildMatchStat(match));

	data.status = 'cancelled';

	updateMatchList(match);
	match.save();

	return match;
}

// mapping
var mapping = {
	'/': {controller: handleIndex},
	'/match/new/': {controller: handleMatchNew},
	'/match/list/': {controller: handleMatchList},
	'/player/list/': {controller: handlePlayerList},
};
var mappingStartsWith = {
	'/match/display/': {controller: handleMatchDisplay},
	'/match/judge/': {controller: handleMatchJudge},
}

// create http server
require('http').createServer(function(req, res) {
	var path = req.url.split('?')[0];
	var buildContext = function() {
		return {
			req: req,
			res: res,
			path: path,
			paths: path.split('/').filter(function(item) {return item.length > 0;}),
			params: req.params
		};
	};
	var handleRequest = function() {
		debug(req.method, path);
		if (mapping[path]) {
			mapping[path].controller(buildContext());
		} else if (isStatic(path)) {
			handleStatic(buildContext());
		} else {
			var found = false;
			for (var k in mappingStartsWith) {
				if (path.startsWith(k)) {
					mappingStartsWith[k].controller(buildContext());
					found = true;
					break;
				}
			}
			if (!found) {
				error404(res);
			}
		}
	};
	if (req.method == 'GET') {
		var index = req.url.indexOf('?');
		if (index >= 0) {
			req.params = qs.parse(req.url.substr(index + 1));
		} else {
			req.params = {};
		}
		handleRequest();
	} else if (req.method == 'POST') {
		var body = '';
		req.on('data', function (data) {
			body += data;
			if (body.length > 1e6) { 
				req.connection.destroy();
			}
		});
		req.on('end', function () {
			req.params = qs.parse(body);
			handleRequest();
		});
	}
}).listen(HTTP_PORT, function() {
	log('HTTP server is running at port ' + HTTP_PORT);
});

// create ws server
var wsServer = require('websocket.io').listen(WS_PORT, function() {
	log('WebSocket server is running at port ' + WS_PORT);
});
wsServer.on('connection', function(socket) {
	var matchStats = {};
	socket.on('message', function(data) {
		var data = JSON.parse(data);
		var match = new JsonFile('match/' + data.id);
		switch (data.action) {
			case 'add':
				match = handleAddPoint(data.player, match, matchStats);
				break;
			case 'undo':
				match = handleUndo(match, matchStats);
				break;
			case 'cancel':
				match = handleCancel(match, matchStats);
				break;
		}
		wsServer.clients.forEach(function(client){
			client.send(JSON.stringify(match.data));
		});
	});
});

// Let's start!
log('---------------------------------------');
log('Open urls listed below in your browser.');
log('');
(function() {
	var interfaces = require('os').networkInterfaces();
	var results = [];
	for (var device in interfaces) {
		interfaces[device].forEach(function(info) {
			if (info.family != 'IPv4') {
				return;
			}
			results.push(info.address);
		});
	}
	return results;
})().forEach(function(ip) {
	log('http://' + ip + (HTTP_PORT != 80 ? ':' + HTTP_PORT : '') + '/');
});
log('');
log('Ctrl+C to stop this server.')
log('---------------------------------------');
