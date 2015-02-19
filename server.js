// globals
var PORT = 10080;
var DEBUG = true;
var VIEW_DIR = './view/'

// requires
var fs = require('fs');
var ejs = require('ejs');

// common
var log = function() {console.log.apply(console, arguments)};

var debug = (function() {
	if (DEBUG) {
		return log;
	} else {
		return function(){};
	}
})();

String.prototype.endsWith = function(suffix) {
	return this.indexOf(suffix, this.length - suffix.length) !== -1;
};

var isStatic = function(path) {
	return path.match(/\.(html|css|js)$/);
}

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

var return200 = function(res, text, type) {
	var type = (type == undefined) ? 'text/html' : type;
	res.writeHead(200, {
		'Content-Type': type,
		'Content-Length': Buffer.byteLength(text, 'utf8')
	});
	res.write(text);
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

// controllers
var handleStatic = function(context) {
	var res = context.res;
	var path = (context.mapping !== undefined && context.mapping.path !== undefined) ? context.mapping.path : context.path;
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
	})();
	fs.readFile('./static/' + path, 'utf8', function(err, text) {
		if (err) {
			log(err);
			error404(res);
			return;
		}
		return200(res, text, type);
	});
};

var handlePlayer = function(context) {
	views['player'].write(context.res, {name: 'HOGE HOGE'});
	// playerView.write(context.res, {name: 'HOGE HOGE'});	
};

// mapping
var mapping = {
	'/': {controller: handleStatic, path: 'index.html'},
	'/player/list/': {controller: handlePlayer}
};

// create server
require('http').createServer(function(req, res) {
	var path = req.url.split('?')[0];
	var params = (function(url) {
		var params = {};
		var index = url.indexOf('?');
		if (index < 0) {
			return params;
		}
		url.substr(index + 1).split('&').forEach(function(param) {
			var index = param.indexOf('=');
			if (index < 0) {
				var key = param;
				var value = '';
			} else {
				var key = param.substr(0, index);
				var value = decodeURI(param.substr(index + 1));
			}
			if (params[key] == undefined) {
				params[key] = value;
			} else if (Array.isArray(params[key])) {
				params[key].push(value);
			} else {
				var tmp = params[key];
				var arr = [tmp, value];
				params[key] = arr;
			}
		});
		return params;
	})(req.url);

	log(req.method, path, params);

	if (mapping[path]) {
		var context = {
			req: req,
			res: res,
			path: path,
			params: params,
			mapping: mapping[path]
		};
		debug(context);
		context.mapping.controller(context);
	} else if (isStatic(path)) {
		var context = {
			req: req,
			res: res,
			path: path,
			params: params
		};
		debug(context);
		handleStatic(context);
	} else {
		error404(res);
	}
}).listen(PORT);

// Let's start!
log('Open urls listed below in your browser.');
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
	log('http://' + ip + (PORT != 80 ? ':' + PORT : '') + '/');
});
log('Ctrl+C to stop this server.')

/*

var http = require('http');
var url = require('url');
var WSServer = require('websocket').server;

var clientHtml = require('fs').readFileSync('client.html');

var plainHttpServer = http.createServer(function(req, res) {
	res.writeHead(200, { 'Content-Type': 'text/html'});
	res.end(clientHtml);
}).listen(PORT);

var webSocketServer = new WSServer({httpServer: plainHttpServer});
*/