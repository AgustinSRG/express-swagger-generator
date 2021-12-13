// Test file

"use strict";

const path = require("path");
const express = require('express');
const router = express();
const generator = require(path.resolve(__dirname, "../dist/index.js"));

/* GET users listing. */
router.get('/', function(req, res, next) {
    res.send('respond with a resource');
});


/**
 * JSON parameters require a model. This one just has "name"
 * @typedef ReqNameJSON
 * @property {string} name.required - name of person making request - eg: John Doe
 */
/**
 * This route will respond greetings to name in json request body.
 * @route POST /hello/
 * @group hello - Test Demo
 * @param {ReqNameJSON.model} name.body.required - username or email
 * @returns {object} 200 - An object with the key 'msg'
 * @returns {Error}  default - Unexpected error
 * @headers {integer} 200.X-Rate-Limit - calls per hour allowed by the user
 * @headers {string} 200.X-Expires-After - 	date in UTC when token expires
 * @produces application/json
 * @consumes application/json
 */
router.post("/", function() {});



/**
 * @typedef Product
 * @property {integer} id
 * @property {string} name.required - Some description for product
 * @property {Array.<Point>} Point
 */

/**
 * @typedef Point
 * @property {integer} x.required
 * @property {integer} y.required - Some description for point - eg: 1234
 * @property {Array.<Color>} Color
 */

/**
 * @typedef Color
 * @property {string} blue
 */

/**
 * @route GET /test/
 * @returns {Array.<Point>} Point - Some description for point
 */
router.get('/test', function() {});

generator(router, {
    swaggerDefinition: {
        info: {
            description: 'API documentation',
            title: "Platform",
            version: '1.0.0',
        },
        host: 'localhost',
        basePath: '/',
        produces: [
            "application/json"
        ],
        schemes: ['http', 'https'],
        securityDefinitions: {
            SessionIdAuth: {
                type: "apiKey",
                in: "header",
                name: "x-session-id",
            },
        },
    },
    basedir: __dirname, //app absolute path
    files: ['*.js'] //Path to the API handle folder
});

router.listen(80, () => {
    console.log("Test server listening on port 80");
});

