// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
// let scalameta = require('scalameta-parsers');
var scalameta = require('scalameta-parsers');


const tokenTypes = new Map<string, number>();
const tokenModifiers = new Map<string, number>();

const legend = (function () {
	const tokenTypesLegend = [
		'comment', 'string', 'keyword', 'number', 'regexp', 'operator', 'namespace',
		'type', 'struct', 'class', 'interface', 'enum', 'typeParameter', 'function',
		'method', 'decorator', 'macro', 'variable', 'parameter', 'property', 'label',
		'import'
	];
	tokenTypesLegend.forEach((tokenType, index) => tokenTypes.set(tokenType, index));

	const tokenModifiersLegend = [
		'declaration', 'documentation', 'readonly', 'static', 'abstract', 'deprecated',
		'modification', 'async'
	];
	tokenModifiersLegend.forEach((tokenModifier, index) => tokenModifiers.set(tokenModifier, index));

	return new vscode.SemanticTokensLegend(tokenTypesLegend, tokenModifiersLegend);
})();


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'scala' },
		new DocumentSemanticTokensProvider(),
		legend));
}

interface IParsedToken {
	line: number;
	startCharacter: number;
	length: number;
	tokenType: string;
	tokenModifiers: string[];
}

class DocumentSemanticTokensProvider implements vscode.DocumentSemanticTokensProvider {
	async provideDocumentSemanticTokens(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.SemanticTokens> {
		const allTokens = this._parseText(document.getText());
		const builder = new vscode.SemanticTokensBuilder();
		allTokens.forEach((token) => {
			builder.push(token.line, token.startCharacter, token.length, this._encodeTokenType(token.tokenType), this._encodeTokenModifiers(token.tokenModifiers));
		});
		return builder.build();
	}

	private _encodeTokenType(tokenType: string): number {
		if (tokenTypes.has(tokenType)) {
			return tokenTypes.get(tokenType)!;
		} else if (tokenType === 'notInLegend') {
			return tokenTypes.size + 2;
		}
		return 0;
	}

	private _encodeTokenModifiers(strTokenModifiers: string[]): number {
		let result = 0;
		for (let i = 0; i < strTokenModifiers.length; i++) {
			const tokenModifier = strTokenModifiers[i];
			if (tokenModifiers.has(tokenModifier)) {
				result = result | (1 << tokenModifiers.get(tokenModifier)!);
			} else if (tokenModifier === 'notInLegend') {
				result = result | (1 << tokenModifiers.size + 2);
			}
		}
		return result;
	}

	private _parseText(text: string): IParsedToken[] {
		const r: IParsedToken[] = [];
		const lines = text.split(/\r\n|\r|\n/);
		const lineLengths = lines.map((v, i) => v.length + 1 /* newline */);
		// console.log(lineLengths);

		function lineNumber(position: number): [number, number] {
			var go = 0;
			var line = 0;

			while (go < position) {
				// console.log("Looking for ", position, line, go);
				go += lineLengths[line];
				if (go <= position) {
					line += 1;
				}
			}

			var newPos = position;

			for (let index = 0; index < line; index++) {
				newPos -= lineLengths[index];

			}

			return [line, newPos];
		}

		let result = scalameta.parseSource(text);
		result.stats.forEach((element: any) => {
			function token(element: any, cls: string, raw: string, modifiers: string[]): IParsedToken {
				let [line, pos] = lineNumber(element.pos.start);
				return {
					line: line,
					startCharacter: pos,
					length: raw.length,
					tokenType: cls,
					tokenModifiers: modifiers
				};
			};

			function addToken(element: any, cls: string, raw: string, modifiers: string[]) {
				let tok = token(element, cls, raw, modifiers);
				console.log("Yay", element);
				console.log("While browsing ", tok, raw);
				r.push(tok);
			}
			console.log(element);

			if (element.type === 'Defn.Class' || element.type === 'Defn.Object') {
				addToken(element.name, 'class', element.name.value, ['declaration']);
				element.mods.forEach((mod: any) => {
					if (mod.type === "Mod.Sealed") {
						addToken(mod, 'keyword', 'sealed', []);
					} else if (mod.type === "Mod.Abstract") {
						addToken(mod, 'keyword', 'abstract', []);
					}
				});
			} else if (element.type === 'Import') {
				addToken(element, 'keyword', 'import', []);
				element.importers.forEach((importer: any) => {
					importer.importees.forEach((importee: any) => {
						addToken(importee.name, 'namespace', importee.name.value, []);
					});
					addToken(importer.ref, 'namespace', importer.ref.value, []);
				});

			}
		});

		console.log(r);
		return r;
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }
