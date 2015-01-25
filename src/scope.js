/* jshint globalstrict: true */
'use strict'; 

function Scope() {
	this.$$watchers = [];
	this.$$lastDirtyWatch = null; 
	this.$$asyncQueue = [];
	this.$$postDigestQueue = [];
	this.$$root = this; 
	this.$$children = []; 
	this.$$listeners = {};
	this.$$phase = null; 
}

function initWatchVal() { }

/* Isolated scopes are part of the scope hierarchy,
 but do not have access to everything of the parent
 */
Scope.prototype.$new = function(isolated) {
	var child; 
	if (isolated) {			
		child = new Scope(); 
		child.$$root = this.$$root;
		child.$$asyncQueue = this.$$asyncQueue;
		child.$$postDigestQueue = this.$$postDigestQueue; 
	} else {
		var ChildScope = function() { };
		ChildScope.prototype = this;
		child = new ChildScope(); 
	}
	this.$$children.push(child); 
	child.$$watchers = []; 
	child.$$listeners = {};
	child.$$children = []; 
	child.$parent = this; 
	return child;
};

/* Find current scope from the parent's $$children array
 then remove it
 */
Scope.prototype.$destroy = function () {	
	if (this === this.$$root) {
		return; 
	}
	var siblings = this.$parent.$$children;
	var indexOfThis = siblings.indexOf(this); 
	if (indexOfThis >= 0) {
		siblings.splice(indexOfThis, 1); 
	}
};

/* Helper function that executes a fn once for each scope
 in the hierarchy until the function returns falsy.
 Invoke fn once for current scope, than recursively calls
 on each child.
 */
Scope.prototype.$$everyScope = function(fn) {
	if ( fn(this) ) {
		return this.$$children.every(function(child) {
			return child.$$everyScope(fn);
		});
	} else {
		return false; 
	}
};

/* Passing true to valueEq registers a value/equality-based
 watch, meaning the watch checks deep value equality.
 Without the valueEq flag, we watch for reference
 */
Scope.prototype.$watch = function(watchFn, listenerFn, valueEq) {
	var self = this; 
	var watcher = {
		watchFn: watchFn, 
		listenerFn: listenerFn || function() { }, 
		valueEq: !!valueEq,
		last: initWatchVal
	};
	this.$$watchers.unshift(watcher); 
	this.$$root.$$lastDirtyWatch = null;
	return function() {
		var index = self.$$watchers.indexOf(watcher); 
		if (index >= 0) {
			self.$$watchers.splice(index, 1); 
			self.$$root.$$lastDirtyWatch = null; 
		}
	};
};

/* $watchCollection is basically an optimization of the
 value-based version of $watch. $watchCollection only 
 watches collections on the shallow level, it can get away
 with an implementation that's faster and uses less memory 
*/
Scope.prototype.$watchCollection = function(watchFn, listenerFn) {
	var self = this; 
	var newValue; 
	var oldValue; 
	var oldLength; // Keep track of sizes of objects to prevent unnecessary iteration
	
	var veryOldValue;
	/* Provides boolean of whether or not we should perform the
	  expensive task of copying full collection into veryOldValue
	  The length property of a Function contains the number
	  of declared arguments in that function
	  */
	var trackVeryOldValue = (listenerFn.length > 1); 
	var firstRun = true; 
	var changeCount = 0; 

	var internalWatchFn = function(scope) {
		var newLength, key; 
		newValue = watchFn(scope); 

		if ( _.isObject(newValue) ) {
			if ( _.isArrayLike(newValue) ) {
				if ( !_.isArray(oldValue) ) {
					changeCount++;
					oldValue = []; 
				}
				if (newValue.length !== oldValue.length) {
					changeCount++; 
					oldValue.length = newValue.length; 
				}
				_.forEach(newValue, function(newItem, i) {
					var bothNaN = _.isNaN(newItem) && _.isNaN(oldValue[i]);
					if (!bothNaN && newItem !== oldValue[i]) {
						changeCount++;
						oldValue[i] = newItem; 
					}
				});
			} else {
				// Arrays are objects, we must also exclude arrays and array-likes
				if (!_.isObject(oldValue) || _.isArrayLike(oldValue)) {
					changeCount++; 
					oldValue = {}; 
					oldLength = 0; 
				}
				newLength = 0; 
				/* _.forOwn iterates over an object's members, 
					 but only the ones defined for the object itself.
					 Members inherited through prototype chain are excluded.
					 $watchCollection does not watch inherited properties. 
					 */
				_.forOwn(newValue, function(newVal, key) {
					newLength++; 
					if(oldValue.hasOwnProperty(key)) {					
						var bothNaN = _.isNaN(newVal) && _.isNaN(oldValue[key]);
						if (!bothNaN && oldValue[key] !== newVal) {
							changeCount++; 
							oldValue[key] = newVal;
						}
					} else {
						changeCount++; 
						oldLength++;
						oldValue[key] = newVal; 
					}
				});
				if (oldLength > newLength) {
					changeCount++; 
					_.forOwn(oldValue, function(oldVal, key) {
						if (!newValue.hasOwnProperty(key)) {
							oldLength--;
							delete oldValue[key];
						}
					});
				}
			}
		} else {
			if ( !self.$$areEqual(newValue, oldValue, false) ) {
				changeCount++; 
			}
			oldValue = newValue; 
		}

		return changeCount; 
	};
	var internalListenerFn = function() {
		if (firstRun) {
			listenerFn(newValue, newValue, self); 
			firstRun = false; 
		} else {
			listenerFn(newValue, veryOldValue, self); 
		}

		if (trackVeryOldValue) {
			veryOldValue = _.clone(newValue); // _.clone gets a shallow copy of collection, and works with primitives
		}
	};

	return this.$watch(internalWatchFn, internalListenerFn);
};

Scope.prototype.$$areEqual = function(newValue, oldValue, valueEq) {
	if (valueEq) {
		return _.isEqual(newValue, oldValue); 
	} else {
		return newValue === oldValue ||
			( typeof newValue === 'number' && typeof oldValue === 'number' &&
				isNaN(newValue) && isNaN(oldValue) );
	}
};

Scope.prototype.$eval = function(expr, locals) {
	return expr(this, locals);
};

Scope.prototype.$evalAsync = function(expr) {
	var self = this;
	if (!self.$$phase && !self.$$asyncQueue.length) {
		setTimeout(function() {
			if (self.$$asyncQueue.length) {
				self.$$root.$digest(); 
			}
		}, 0); 
	}
	self.$$asyncQueue.push({scope: this, expression: expr}); 
};

/* $apply starts at root and digests entire scope hierarchy
 while $digest runs down the hierarchy from this scope
 	*/
Scope.prototype.$apply = function(expr) {
	try {
		this.$beginPhase('$apply');
		return this.$eval(expr);
	} finally {
		this.$clearPhase(); 
		this.$$root.$digest(); 	
	}
};

Scope.prototype.$$digestOnce = function() {
	var dirty; 
	var continueLoop = true;
	var self = this; 
	this.$$everyScope(function(scope) {
		var newValue, oldValue; 
		_.forEachRight(scope.$$watchers, function(watcher) {
			try {
				// The watch fns must be passed the scope object they
				// were originally attached to, not the scope object we 
				// happen to call $digest on. 
				if (watcher) {
					newValue = watcher.watchFn(scope); 
					oldValue = watcher.last;
					if ( !scope.$$areEqual(newValue, oldValue, watcher.valueEq) ) {
						scope.$$root.$$lastDirtyWatch = watcher; 
						watcher.last = (watcher.valueEq ? _.cloneDeep(newValue) : newValue); 
						watcher.listenerFn(newValue, 
							(oldValue === initWatchVal ? newValue : oldValue),
							scope); 
						dirty = true; 
					} else if (scope.$$root.$$lastDirtyWatch === watcher) {
						continueLoop = false; 
						return false; 
					}
				}
			} catch(e) {
				console.error(e); 
			}
		});
		return continueLoop;
	});
	return dirty; 
};

/* digest the watches attached to the scope we call and
 it's children, but not watches attached to parents or siblings
 */
Scope.prototype.$digest = function() {
	var ttl = 10;
	var dirty;
	this.$$root.$$lastDirtyWatch = null; 
	this.$beginPhase('$digest'); 
	do {
		while (this.$$asyncQueue.length) {
			try {
				var asyncTask = this.$$asyncQueue.shift();
				asyncTask.scope.$eval(asyncTask.expression); 
			} catch(e) {
				console.error(e); 
			}
		}
		dirty = this.$$digestOnce();
		if ( (dirty || this.$$asyncQueue.length) && !(ttl--) ) {
			this.$clearPhase();
			throw "10 digest iterations reached";
		}
	} while (dirty || this.$$asyncQueue.length);
	this.$clearPhase(); 

	while(this.$$postDigestQueue.length) {
		try{
			this.$$postDigestQueue.shift()();
		} catch(e) {
			console.error(e); 
		}
	}
};

Scope.prototype.$beginPhase = function(phase) {
	if (this.$$phase) {
		throw this.$$phase + ' already in progress.';
	}
	this.$$phase = phase; 
};

Scope.prototype.$clearPhase = function() {
	this.$$phase = null; 
};

Scope.prototype.$$postDigest = function(fn) {
	this.$$postDigestQueue.push(fn); 
};

Scope.prototype.$on = function(eventName, listener) {
	var listeners = this.$$listeners[eventName];
	if (!listeners) {
		this.$$listeners[eventName] = listeners = []; 
	} 
	listeners.push(listener);
};

Scope.prototype.$emit = function(eventName) {
	this.$$fireEventOnScope(eventName); 
};

Scope.prototype.$broadcast = function(eventName) {
	this.$$fireEventOnScope(eventName); 
};

Scope.prototype.$$fireEventOnScope = function(eventName) {
	var event = {name: eventName}; 
	var listeners = this.$$listeners[eventName] || [];
	_.forEach(listeners, function(listener) {
		listener(event);
	});
};


