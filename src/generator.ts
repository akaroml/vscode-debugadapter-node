/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as fs from 'fs';
import {IProtocol, Protocol as P} from './json_schema';

let numIndents = 0;

function Module(moduleName: string, schema: IProtocol): string {

	let s = '';
	s += line("/*---------------------------------------------------------------------------------------------");
	s += line(" *  Copyright (c) Microsoft Corporation. All rights reserved.");
	s += line(" *  Licensed under the MIT License. See License.txt in the project root for license information.");
	s += line(" *--------------------------------------------------------------------------------------------*/");
	s += line();
	s += line("'use strict';");
	s += line();

	//s += comment(schema.description);
	s += comment('Declaration module describing the VS Code debug protocol.\nAuto-generated from json schema. Do not edit manually.');

	s += openBlock(`export module ${moduleName}`);

	for (let typeName in schema.definitions) {

		const d2 = schema.definitions[typeName];

		let supertype: string = null;
		if ((<P.AllOf>d2).allOf) {
			const array = (<P.AllOf>d2).allOf;
			for (let d of array) {
				if ((<P.RefType>d).$ref) {
					supertype = getRef((<P.RefType>d).$ref);
				} else {
					s += Interface(typeName, <P.Definition> d, supertype);
				}
			}
		} else {
			if ((<P.StringType>d2).enum) {
				s += Enum(typeName, <P.StringType> d2);
			} else {
				s += Interface(typeName, <P.Definition> d2);
			}
		}
	}

	s += closeBlock();
	s += line();

	return s;
}

function Interface(interfaceName: string, definition: P.Definition, superType?: string): string {

	let s = line();

	s += comment(definition.description);

	let x = `export interface ${interfaceName}`;
	if (superType) {
		x += ` extends ${superType}`;
	}
	s += openBlock(x);

	for (let propName in definition.properties) {
		const required = definition.required ? definition.required.indexOf(propName) >= 0 : false;
		s += property(propName, !required, definition.properties[propName]);
	}

	s += closeBlock();

	return s;
}

function Enum(typeName: string, definition: P.StringType): string {
	let s = line();
	s += comment(definition.description, definition.enum, definition.enumDescriptions);
	const x = definition.enum.map(v => `'${v}'`).join(' | ');
	s += line(`export type ${typeName} = ${x};`);
	return s;
}

function comment(description: string, enums?: string[], enumDescriptions?: string[]): string {
	if (description) {
		if (enums && enumDescriptions) {
			for (let i = 0; i < enums.length; i++) {
				description += `\n${enums[i]}: ${enumDescriptions[i]}`;
			}
		}
		description = description.replace(/<code>(.*)<\/code>/g, "'$1'");
		numIndents++;
		description = description.replace(/\n/g, '\n' + indent());
		numIndents--;
		if (description.indexOf('\n') >= 0) {
			return line(`/** ${description}\n${indent()}*/`);
		} else {
			return line(`/** ${description} */`);
		}
	}
	return '';
}

function openBlock(str: string, openChar?: string, indent?: boolean): string {
	indent = typeof indent === 'boolean' ?  indent : true;
	openChar = openChar || ' {';
	let s = line(`${str}${openChar}`, true, indent);
	numIndents++;
	return s;
}

function closeBlock(closeChar?: string, newline?: boolean): string {
	newline = typeof newline === 'boolean' ? newline : true;
	closeChar = closeChar || '}';
	numIndents--;
	return line(closeChar, newline);
}

function propertyType(prop: any): string {
	if (prop.$ref) {
		return getRef(prop.$ref);
	}
	switch (prop.type) {
		case 'array':
			return `${propertyType(prop.items)}[]`;
		case 'object':
			return objectType(prop);
		case 'string':
			if (prop.enum) {
				return prop.enum.map(v => `'${v}'`).join(' | ');
			}
			return `string`;
		case 'integer':
			return 'number';
	}
	if (Array.isArray(prop.type)) {
		if (prop.type.length === 7 && prop.type.sort().join() === 'array,boolean,integer,null,number,object,string') {	// silly way to detect all possible json schema types
			return 'any';
		} else {
			return prop.type.map(v => v === 'integer' ? 'number' : v).join(' | ');
		}
	}
	return prop.type;
}

function objectType(prop: any): string {
	if (prop.properties) {
		let s = openBlock('', '{', false);

		for (let propName in prop.properties) {
			const required = prop.required ? prop.required.indexOf(propName) >= 0 : false;
			s += property(propName, !required, prop.properties[propName]);
		}

		s += closeBlock('}', false);
		return s;
	}
	if (prop.additionalProperties) {
		return `{ [key: string]: ${prop.additionalProperties.type}; }`;
	}
	return '{}';
}

function property(name: string, optional: boolean, prop: P.PropertyType): string {
	let s = '';
	s += comment(prop.description, (<P.StringType>prop).enum, (<P.StringType>prop).enumDescriptions);
	const type = propertyType(prop);
	const propertyDef = `${name}${optional ? '?' : ''}: ${type}`;
	if (type[0] === '\'' && type[type.length-1] === '\'' && type.indexOf('|') < 0) {
		s += line(`// ${propertyDef};`);
	} else {
		s += line(`${propertyDef};`);
	}
	return s;
}

function getRef(ref: string): string {
	const REXP = /#\/(.+)\/(.+)/;
	const matches = REXP.exec(ref);
	if (matches && matches.length === 3) {
		return matches[2];
	}
	console.log('error: ref');
	return ref;
}

function indent(): string {
	return '\t'.repeat(numIndents);
}

function line(str?: string, newline?: boolean, indnt?: boolean): string {
	newline = typeof newline === 'boolean' ? newline : true;
	indnt = typeof indnt === 'boolean' ? indnt : true;
	let s = '';
	if (str) {
		if (indnt) {
			s += indent();
		}
		s += str;
	}
	if (newline) {
		s += '\n';
	}
	return s;
}


/// Main

const debugProtocolSchema = JSON.parse(fs.readFileSync('./debugProtocol.json').toString());

const emitStr = Module('DebugProtocol', debugProtocolSchema);

fs.writeFileSync(`./protocol/src/debugProtocol.ts`, emitStr, 'utf-8');
