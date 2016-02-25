/* jshint globalstrict:true */
'use strict';

function parse(expr) {
	var lexer = new Lexer();
	var parser = new Parser();
	return parser.parse(expr);
}

function Lexer() {

}

Lexer.prototype.lex = function(text) {

};

function Parser() {

}

Parser.prototype.parse = function(text) {
	this.tokens = this.lexer.lex(text);
};

