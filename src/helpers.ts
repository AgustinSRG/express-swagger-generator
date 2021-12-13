// Swagger helpers

"use strict";

import RecursiveIterator from 'recursive-iterator';

/**
 * Checks if tag is already contained withing target.
 * The tag is an object of type http://swagger.io/specification/#tagObject
 * The target, is the part of the swagger specification that holds all tags.
 * @param target - Swagger object place to include the tags data.
 * @param tag - Swagger tag object to be included.
 * @returns {boolean} Does tag is already present in target
 */
function _tagDuplicated(target: any, tag: any) {
    // Check input is workable.
    if (target && target.length && tag) {
        for (let i = 0; i < target.length; i = i + 1) {
            const targetTag = target[i];
            // The name of the tag to include already exists in the taget.
            // Therefore, it's not necessary to be added again.
            if (targetTag.name === tag.name) {
                return true;
            }
        }
    }

    // This will indicate that `tag` is not present in `target`.
    return false;
}

/**
 * Adds the tags property to a swagger object.
 * @param conf - Flexible configuration.
 */
function _attachTags(conf: any) {
    const tag = conf.tag;
    const swaggerObject = conf.swaggerObject;
    let propertyName = conf.propertyName;

    // Correct deprecated property.
    if (propertyName === 'tag') {
        propertyName = 'tags';
    }

    if (Array.isArray(tag)) {
        for (let i = 0; i < tag.length; i = i + 1) {
            if (!_tagDuplicated(swaggerObject[propertyName], tag[i])) {
                swaggerObject[propertyName].push(tag[i]);
            }
        }
    } else {
        if (!_tagDuplicated(swaggerObject[propertyName], tag)) {
            swaggerObject[propertyName].push(tag);
        }
    }
}

/**
 * Merges two objects
 * @param obj1 - Object 1
 * @param obj2 - Object 2
 * @returns Merged Object
 */
function _objectMerge(obj1: any, obj2: any) {
    const obj3 = Object.create(null);
    for (const attr of Object.keys(obj1)) {
        obj3[attr] = obj1[attr];
    }
    for (const name of Object.keys(obj2)) {
        obj3[name] = obj2[name];
    }
    return obj3;
}

/**
 * Adds necessary swagger schema object properties.
 * @see https://goo.gl/Eoagtl
 * @param swaggerObject - The object to receive properties.
 * @returns swaggerObject - The updated object.
 */
export function swaggerizeObj(swaggerObject: any) {
    swaggerObject.swagger = '2.0';
    swaggerObject.paths = swaggerObject.paths || {};
    swaggerObject.definitions = swaggerObject.definitions || {};
    swaggerObject.responses = swaggerObject.responses || {};
    swaggerObject.parameters = swaggerObject.parameters || {};
    swaggerObject.securityDefinitions = swaggerObject.securityDefinitions || {};
    swaggerObject.tags = swaggerObject.tags || [];
    return swaggerObject;
}

/**
 * List of deprecated or wrong swagger schema properties in singular.
 * @function
 * @returns {array} The list of deprecated property names.
 */
function _getSwaggerSchemaWrongProperties() {
    return [
        'consume',
        'produce',
        'path',
        'tag',
        'definition',
        'securityDefinition',
        'scheme',
        'response',
        'parameter',
        'deprecated'
    ];
}

/**
 * Makes a deprecated property plural if necessary.
 * @param propertyName - The swagger property name to check.
 * @returns The updated propertyName if neccessary.
 */
function _correctSwaggerKey(propertyName: string): string {
    const wrong = _getSwaggerSchemaWrongProperties();
    if (wrong.indexOf(propertyName) > 0) {
        // Returns the corrected property name.
        return propertyName + 's';
    }
    return propertyName;
}

/**
 * Handles swagger propertyName in pathObject context for swaggerObject.
 * @param swaggerObject - The swagger object to update.
 * @param pathObject - The input context of an item for swaggerObject.
 * @param propertyName - The property to handle.
 */
function _organizeSwaggerProperties(swaggerObject: any, pathObject: any, propertyName: string) {
    const simpleProperties = [
        'consume',
        'consumes',
        'produce',
        'produces',
        // 'path',
        // 'paths',
        'schema',
        'schemas',
        'securityDefinition',
        'securityDefinitions',
        'response',
        'responses',
        'parameter',
        'parameters',
        'definition',
        'definitions',
    ];

    // Common properties.
    if (simpleProperties.indexOf(propertyName) !== -1) {
        const keyName = _correctSwaggerKey(propertyName);
        const definitionNames = Object.keys(pathObject[propertyName]);
        for (const definitionName of definitionNames) {
            swaggerObject[keyName][definitionName] =
                pathObject[propertyName][definitionName];
        }
        // Tags.
    } else if (propertyName === 'tag' || propertyName === 'tags') {
        const tag = pathObject[propertyName];
        _attachTags({
            tag: tag,
            swaggerObject: swaggerObject,
            propertyName: propertyName,
        });
        // Paths.
    } else {
        const routes = Object.keys(pathObject[propertyName]);

        for (const route of routes) {
            if (!swaggerObject.paths) {
                swaggerObject.paths = {};
            }
            swaggerObject.paths[route] = _objectMerge(
                swaggerObject.paths[route], pathObject[propertyName][route]
            );
        }
    }
}

/**
 * Adds the data in to the swagger object.
 * @param swaggerObject - Swagger object which will be written to
 * @param data - objects of parsed swagger data from yml or jsDoc
 *                          comments
 */
export function addDataToSwaggerObject(swaggerObject: any, data: any[]) {
    if (!swaggerObject || !data) {
        throw new Error('swaggerObject and data are required!');
    }

    for (let i = 0; i < data.length; i = i + 1) {
        const pathObject = data[i];
        const propertyNames = Object.keys(pathObject);
        // Iterating the properties of the a given pathObject.
        for (const propertyName of propertyNames) {
            // Do what's necessary to organize the end specification.
            _organizeSwaggerProperties(swaggerObject, pathObject, propertyName);
        }
    }
}

/**
 * Aggregates a list of wrong properties in problems.
 * Searches in object based on a list of wrongSet.
 * @param list - a list to iterate
 * @param wrongSet - a list of wrong properties
 * @param problems - aggregate list of found problems
 */
function seekWrong(list: any, wrongSet: any[], problems: any[]) {
    const iterator = new RecursiveIterator(list, 0, false);
    for (let item = iterator.next(); !item.done; item = iterator.next()) {
        const isDirectChildOfProperties =
            item.value.path[item.value.path.length - 2] === 'properties';

        if (wrongSet.indexOf(item.value.key) > 0 && !isDirectChildOfProperties) {
            problems.push(item.value.key);
        }
    }
}

/**
 * Returns a list of problematic tags if any.
 * @param sources - a list of objects to iterate and check
 * @returns problems - a list of problems encountered
 */
export function findDeprecated(sources: any[]) {
    const wrong = _getSwaggerSchemaWrongProperties();
    // accumulate problems encountered
    const problems = [];
    sources.forEach(function (source) {
        // Iterate through `source`, search for `wrong`, accumulate in `problems`.
        seekWrong(source, wrong, problems);
    });
    return problems;
}
