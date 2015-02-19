var formatPoint = function(point) {
	var str = '';
	if (point < 10) {
		str += '<span class="dark">0</span>';
	}
	str += point;
	return str;
}
var formatDate = function(date) {
	str = date.getFullYear() + '-';
	str += String('0' + (date.getMonth() + 1)).slice(-2) + '-';
	str += String('0' + date.getDate() ).slice(-2) + ' ';
	str += String('0' + date.getHours()).slice(-2) + ':';
	str += String('0' + date.getMinutes()).slice(-2);
	return str;
}
// for node.js
if (typeof module !== 'undefined') {
	module.exports = {
		formatPoint: formatPoint,
		formatDate: formatDate
	};
}
