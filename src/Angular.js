/* jshint globalstrict: true */
'use strict';

_.mixin({
	/* Handles array-like objects like arguments and NodeList */
	isArrayLike: function(obj) {
		if (_.isNull(obj) || _.isUndefined(obj)) {
			return false; 
		}
		var length = obj.length; 
		return _.isNumber(length); 
	}
});