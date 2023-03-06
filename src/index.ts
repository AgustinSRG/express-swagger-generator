// Swagger helpers

"use strict";

import fs from 'fs';
import { globSync } from 'glob';
import path from 'path';
import SwaggerParser from 'swagger-parser';
import { parseFileContent } from 'doctrine-file';
import swaggerUi from 'express-swaggerize-ui';
import { addDataToSwaggerObject, swaggerizeObj } from './helpers';

/**
 * Parses the provided API file for JSDoc comments.
 * @param file - File to be parsed
 * @returns JSDoc comments
 * @requires doctrine
 */
function parseApiFile(file: string) {
    const content = fs.readFileSync(file, 'utf-8');
    const comments = parseFileContent(content, { unwrap: true, sloppy: true, tags: null, recoverable: true });
    return comments;
}

function parseRoute(str: string): { method: string, uri: string } {
    const split = str.split(" ")

    return {
        method: split[0].toLowerCase() || 'get',
        uri: split[1] || ''
    }
}

function parseField(str: string): { name: string, parameter_type: string, required: boolean } {
    const split = str.split(".")
    return {
        name: split[0],
        parameter_type: split[1] || 'get',
        required: split[2] && split[2] === 'required' || false
    }
}

function parseType(obj: any): string {
    if (!obj) return undefined;
    if (obj.name) {
        const spl = obj.name.split('.');
        if (spl.length > 1 && spl[1] === 'model') {
            return spl[0];
        }
        else return obj.name;
    } else if (obj.expression && obj.expression.name) {
        return obj.expression.name.toLowerCase();
    } else {
        return 'string';
    }
}

function parseSchema(obj: any) {
    if (!(obj.name || obj.applications)) return undefined;

    if (obj.name) {
        const spl = obj.name.split('.');
        if (spl.length > 1 && spl[1] === 'model') {
            return { "$ref": "#/definitions/" + spl[0] };
        } else {
            return undefined;
        }
    }
    if (obj.applications) {
        if (obj.applications.length === 1) {
            const type = obj.applications[0].name;
            if (type === 'object' || type === 'string' || type === 'integer' || type === 'boolean') {
                return {
                    type: obj.expression.name.toLowerCase(),
                    items: {
                        "type": type
                    }
                }
            } else {
                return {
                    type: obj.expression.name.toLowerCase(),
                    items: {
                        "$ref": "#/definitions/" + obj.applications[0].name
                    }
                }
            }
        }
        const oneOf = []
        for (const i of Object.keys(obj.applications)) {
            const type = obj.applications[i].name;
            if (type === 'object' || type === 'string' || type === 'integer' || type === 'boolean') {
                oneOf.push({
                    "type": type
                })
            } else {
                oneOf.push({
                    "$ref": "#/definitions/" + obj.applications[i].name
                })
            }
            return {
                type: obj.expression.name.toLowerCase(),
                items: {
                    oneOf: oneOf
                }
            }
        }
    }

    return undefined
}

function parseItems(obj: any) {
    if (obj.applications && obj.applications.length > 0 && obj.applications[0].name) {
        const type = obj.applications[0].name;
        if (type === 'object' || type === 'string' || type === 'integer' || type === 'boolean') {
            return { "type": type }
        } else {
            return { "$ref": "#/definitions/" + type };
        }
    } else {
        return undefined;
    }
}

function parseReturn(tags: any) {
    const rets = {}
    const headers = parseHeaders(tags)

    for (const i in tags) {
        if (tags[i]['title'] === 'returns' || tags[i]['title'] === 'return') {
            const description = tags[i]['description'].split("-"), key = description[0].trim()

            rets[key] = {
                description: description[1] ? description[1].trim() : '',
                headers: headers[key]
            };
            const type = parseType(tags[i].type);
            if (type) {
                // rets[key].type = type;
                rets[key].schema = parseSchema(tags[i].type)
            }
        }
    }
    return rets
}

function parseDescription(obj: any) {
    const description = obj.description || '';
    const sanitizedDescription = description.replace('/**', '');
    return sanitizedDescription;
}

function parseTag(tags: any) {
    for (const i in tags) {
        if (tags[i]['title'] === 'group') {
            return tags[i]['description'].split("-")
        }
    }
    return ['default', '']
}

function parseProduces(str: string): string[] {
    return str.split(/\s+/);
}


function parseConsumes(str: string): string[] {
    return str.split(/\s+/);
}

function parseTypedef(tags: any) {
    const typeName = tags[0]['name'];
    const details: any = {
        properties: {}
    };
    if (tags[0].type && tags[0].type.name) {
        details.allOf = [{ "$ref": '#/definitions/' + tags[0].type.name }]
    }
    for (let i = 1; i < tags.length; i++) {
        if (tags[i].title === 'property') {
            let propName = tags[i].name;
            const propNameArr = propName.split(".");

            const props = propNameArr.slice(1, propNameArr.length)
            const required = props.indexOf('required') > -1
            const readOnly = props.indexOf('readOnly') > -1

            if (required) {
                if (!details.required) details.required = [];
                propName = propName.split('.')[0];
                details.required.push(propName);
            }
            const schema = parseSchema(tags[i].type);

            if (schema) {
                details.properties[propName] = schema;
            } else {
                const type = parseType(tags[i].type);
                const parsedDescription = (tags[i].description || '').split(/-\s*eg:\s*/);
                const description = parsedDescription[0];
                const example = parsedDescription[1];

                const prop: any = {
                    type: type,
                    description: description,
                    items: parseItems(tags[i].type),
                };
                if (readOnly) {
                    prop.readOnly = true
                }
                details.properties[propName] = prop

                if (prop.type === 'enum') {
                    const parsedEnum = parseEnums('-eg:' + example)
                    prop.type = parsedEnum.type
                    prop.enum = parsedEnum.enums
                }

                if (example) {
                    switch (type) {
                    case 'boolean':
                        details.properties[propName].example = example === 'true';
                        break;
                    case 'integer':
                        details.properties[propName].example = +example;
                        break;
                    case 'enum':
                        break;
                    default:
                        details.properties[propName].example = example;
                        break;
                    }
                }
            }
        }
    }
    return { typeName, details };
}

function parseSecurity(comments) {
    let security;
    try {
        security = JSON.parse(comments)
    } catch (e) {
        const obj = {}
        obj[comments] = []
        security = [
            obj
        ]
    }
    return security
}

function parseHeaders(comments) {
    const headers = {}
    for (const i in comments) {
        if (comments[i]['title'] === 'headers' || comments[i]['title'] === 'header') {

            const description = comments[i]['description'].split(/\s+-\s+/)

            if (description.length < 1) {
                break
            }
            const code2name = description[0].split(".")

            if (code2name.length < 2) {
                break
            }

            const type = code2name[0].match(/\w+/)
            const code = code2name[0].match(/\d+/)

            if (!type || !code) {
                break;
            }
            const code0 = code[0].trim();
            if (!headers[code0]) {
                headers[code0] = {}
            }

            headers[code0][code2name[1]] = {
                type: type[0],
                description: description[1]
            }
        }
    }
    return headers
}

function parseEnums(description: string): { type: string, enums: string[] } {
    const enums = ('' + description).split(/-\s*eg:\s*/)
    if (enums.length < 2) {
        return {
            type: 'string',
            enums: [],
        };
    }
    let parseType = enums[1].split(":")
    if (parseType.length === 1) {
        parseType = ['string', parseType[0]]
    }
    return {
        type: parseType[0],
        enums: parseType[1].split(",")
    }
}

function fileFormat(comments: any) {

    let route;
    const parameters: any = {};
    const params = [];
    const tags = [];
    const definitions = {};
    for (const i of Object.keys(comments)) {
        const desc = parseDescription(comments);
        if (i === 'tags') {
            if (comments[i].length > 0 && comments[i][0]['title'] && comments[i][0]['title'] === 'typedef') {

                const typedefParsed = parseTypedef(comments[i]);
                definitions[typedefParsed.typeName] = typedefParsed.details;
                continue;
            }
            for (const j in comments[i]) {
                const title = comments[i][j]['title']
                if (title === 'route') {
                    route = parseRoute(comments[i][j]['description'])
                    const tag = parseTag(comments[i])
                    parameters[route.uri] = parameters[route.uri] || {}
                    parameters[route.uri][route.method] = parameters[route.uri][route.method] || {}
                    parameters[route.uri][route.method]['parameters'] = []
                    parameters[route.uri][route.method]['description'] = desc
                    parameters[route.uri][route.method]['tags'] = [tag[0].trim()]
                    tags.push({
                        name: typeof tag[0] === 'string' ? tag[0].trim() : '',
                        description: typeof tag[1] === 'string' ? tag[1].trim() : ''
                    })
                }
                if (title === 'param') {
                    const field = parseField(comments[i][j]['name']);
                    const properties: any = {
                        name: field.name,
                        in: field.parameter_type,
                        description: comments[i][j]['description'],
                        required: field.required
                    };
                    const schema = parseSchema(comments[i][j]['type']);
                    // we only want a type if there is no referenced schema
                    if (!schema) {
                        properties.type = parseType(comments[i][j]['type'])
                        if (properties.type === 'enum') {
                            const parsedEnum = parseEnums(comments[i][j]['description'])
                            properties.type = parsedEnum.type
                            properties.enum = parsedEnum.enums
                        }
                    } else
                        properties.schema = schema
                    params.push(properties)
                }

                if (title === 'operationId' && route) {
                    parameters[route.uri][route.method]['operationId'] = comments[i][j]['description'];
                }

                if (title === 'summary' && route) {
                    parameters[route.uri][route.method]['summary'] = comments[i][j]['description'];
                }

                if (title === 'produces' && route) {
                    parameters[route.uri][route.method]['produces'] = parseProduces(comments[i][j]['description']);
                }

                if (title === 'consumes' && route) {
                    parameters[route.uri][route.method]['consumes'] = parseConsumes(comments[i][j]['description']);
                }

                if (title === 'security' && route) {
                    parameters[route.uri][route.method]['security'] = parseSecurity(comments[i][j]['description'])
                }

                if (title === 'deprecated' && route) {
                    parameters[route.uri][route.method]['deprecated'] = true;
                }

                if (route) {
                    parameters[route.uri][route.method]['parameters'] = params;
                    parameters[route.uri][route.method]['responses'] = parseReturn(comments[i]);
                }
            }
        }
    }
    return { parameters: parameters, tags: tags, definitions: definitions }
}

/**
 * Filters JSDoc comments
 * @function
 * @param jsDocComments - JSDoc comments
 * @requires js-yaml
 */
function filterJsDocComments(jsDocComments: any[]) {
    return jsDocComments.filter(function (item) {
        return item.tags.length > 0;
    });
}

/**
 * Converts an array of globs to full paths
 * @param globs - Array of globs and/or normal paths
 * @requires glob
 */
function convertGlobPaths(base: string, globs: string[]): string[] {
    return globs.reduce(function (acc, globString) {
        const globFiles = globSync(globString, { cwd: base }).map(p => {
            return path.resolve(base, p);
        });
        return acc.concat(globFiles);
    }, []);
}

interface SwgaggerGeneratorOptions {
    route?: {
        url?: string,
        docs?: string,
    },
    files: string[],
    basedir: string,
    swaggerDefinition: {
        info: {
            title: string,
            description: string,
            version: string,
        },
        host: string,
        basePath: string,
        produces: string[],
        schemes: string[],
        securityDefinitions?: {
            [key: string]: {
                type: string,
                in: string,
                name: string
            }
        },
    },
}


function generateSpecAndMount(app: any, options: SwgaggerGeneratorOptions) {
    /* istanbul ignore if */
    if (!options) {
        throw new Error('\'options\' is required.');
    } else /* istanbul ignore if */ if (!options.swaggerDefinition) {
        throw new Error('\'swaggerDefinition\' is required.');
    } else /* istanbul ignore if */ if (!options.files) {
        throw new Error('\'files\' is required.');
    }

    // Build basic swagger json
    let swaggerObject = swaggerizeObj(options.swaggerDefinition);
    const apiFiles = convertGlobPaths(options.basedir, options.files);

    // Parse the documentation in the APIs array.
    for (const file of apiFiles) {
        const parsedFile = parseApiFile(file);
        const comments = filterJsDocComments(parsedFile);

        for (const j of Object.keys(comments)) {
            try {
                const parsed = fileFormat(comments[j])
                addDataToSwaggerObject(swaggerObject, [{
                    paths: parsed.parameters,
                    tags: parsed.tags,
                    definitions: parsed.definitions
                }]);
            } catch (e) {
                throw new Error(`Incorrect comment format. Method was not documented.\nFile: ${file}\nComment: ${comments[j].description}`)
            }
        }
    }

    (<any>SwaggerParser).parse(swaggerObject, function (err, api) {
        if (!err) {
            swaggerObject = api;
        }
    });

    const url = options.route ? options.route.url : '/api-docs'
    const docs = options.route ? options.route.docs : '/api-docs.json'

    app.use(docs, function (req, res) {
        res.json(swaggerObject);
    });
    app.use(url, swaggerUi({
        route: url,
        docs: docs
    }));
    return swaggerObject;
}

export = generateSpecAndMount;
