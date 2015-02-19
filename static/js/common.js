var formatPoint = function(point) {
	var str = '';
	if (point < 10) {
		str += '<span class="dark">0</span>';
	}
	str += point;
	return str;
}
// for node.js
if (module) {
	module.exports = {
		formatPoint: formatPoint
	};
}
