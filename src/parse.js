/* jshint globalstrict:true */
'use strict';

var ESCAPES = {n: '\n', f: '\f', r: '\r', t: '\t', v: '\v', '\'':'\'', '"':'"'};

function parse(expr) {
	var lexer = new Lexer();
	var parser = new Parser(lexer);
	return parser.parse(expr);
}

function Lexer() {

}

Lexer.prototype.lex = function(text) {
	this.text = text;
	this.index = 0;
	this.ch = undefined;
	this.tokens = [];
	while (this.index < this.text.length) {
		this.ch = this.text.charAt(this.index);
		if (this.isNumber(this.ch) || ( this.ch === '.' && this.isNumber( this.peek() ) ) ) {
			this.readNumber();
		} else if ( this.ch === '\'' || this.ch === '"' ) {
			this.readString(this.ch);
		} else {
			throw 'Unexpected next character: ' + this.ch;
		}
		this.tokens.push(this.text[this.index]);
	}

	return this.tokens;
};

Lexer.prototype.isNumber = function(ch) {
	return '0' <= ch && ch <= '9';
};

Lexer.prototype.readNumber = function() {
	var number = '';
	while (this.index < this.text.length) {
		var ch = this.text[this.index].toLowerCase();
		if ( ch === '.' || this.isNumber(ch) ) {
			number += ch;
		} else {
			var nextChar = this.peek();
			var prevChar = number[number.length - 1];
			if ( ch === 'e' && this.isExpOperator(nextChar) ) {
				number += ch;
			} else if ( this.isExpOperator(ch) && prevChar === 'e' && nextChar && this.isNumber(nextChar)) {
				number += ch;
			} else if ( this.isExpOperator(ch) && prevChar ==='e' && (!nextChar || !this.isNumber(nextChar) ) ){
				throw 'Invalid exponent';
			} else {
				break;
			}
		}
		this.index++;
	}
	number = 1 * number;
	this.tokens.push({
		text: number,
		fn: _.constant(number),
		json: true
	});
};

Lexer.prototype.readString = function(quote) {
	this.index++;
	var rawString = quote;
	var string = '';
	var escapeMode = false;
	while (this.index < this.text.length) {
		var ch = this.text[this.index];
		rawString += ch;
		if (escapeMode) {
			if (ch === 'u') {
				var hex = this.text.substring(this.index + 1, this.index + 5);
				if (!hex.match(/[\da-f]{4}/i)) {
					throw 'Invalid unicode escapes';
				}
				rawString += hex;
				this.index += 4;
				string += String.fromCharCode(parseInt(hex, 16));
			} else {

				var replacement = ESCAPES[ch];
				if (replacement) {
					string += replacement;
				} else {
					string += ch;
				}
			}
			escapeMode = false;

		} else if (ch === quote) {
			this.index++;
			this.tokens.push({
				text: rawString,
				json: true,
				fn: _.constant(string)
			});
			console.log(rawString, string);
			return;
		} else if (ch === '\\') {
			escapeMode = true;
		} else {
			string += ch;
		}
		this.index++;
	}
	throw 'Unmatched quote';
};

Lexer.prototype.peek = function() {
	return this.index < this.text.length - 1 ? this.text[this.index + 1] : false;
};

Lexer.prototype.isExpOperator = function(ch) {
	return ch === '-' || ch === '+' || this.isNumber(ch);
};

function Parser(lexer) {
	this.lexer = lexer;
}

Parser.prototype.parse = function(text) {
	this.tokens = this.lexer.lex(text);
	return this.primary();
};

Parser.prototype.primary = function() {
	var token = this.tokens[0];
	var primary = token.fn;
	if (token.json) {
		primary.constant = true;
		primary.literal = true;
	}
	return primary;
};

