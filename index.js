'use strict';

const got = require('got');
const http = require('http');
const nacl = require('tweetnacl');
const fs = require('fs');

const commands = require('./commands');

if (!fs.existsSync('secret.txt')) {
    console.error("Missing secret.txt for client secret. Please provide it.");
    process.exit(1);
}

const secret = fs.readFileSync('secret.txt');
const client_id = '183300066658877441';
const scope = 'applications.commands.update';

let token = fs.existsSync('token.txt') ? fs.readFileSync('token.txt') : false;

const PING_TYPE = 1, PONG_TYPE = 1, APPLICATION_COMMAND_TYPE = 2;

// Your public key can be found on your application in the Developer Portal
const PUBLIC_KEY = 'e3fe46878cb1fca040933cf820ee5c5dd391d37d85f5a1f1d4d0799ee79338ea';

async function loadup() {
    let needsToken = true;
    if (token) {
        try {
            await got({
                url: 'https://discord.com/api/oauth2/@me',
                method: 'GET',
                headers: {Authorization: 'Bearer ' + token}
            }).json();
            needsToken = false;
            console.log("Old token was valid, reusing...");
        } catch (e) {
            console.log("Error verifying token, probably invalid: ");
            console.error(e);
            try {
                console.error(e.response.body);
            } catch {}
        }
    }
    if (needsToken) {
        try {
            let response = await got({
                url: 'https://discord.com/api/oauth2/token',
                method: 'POST',
                form: {
                    client_id: client_id,
                    client_secret: secret,
                    scope: scope,
                    grant_type: 'client_credentials'
                }
            }).json();
            console.log("Got response for token, setting...");
            token = response.access_token;

            fs.writeFileSync('token.txt', token);

        } catch (e) {
            console.error("Couldn't get new token:");
            console.error(e);
            try {
                console.error(e.response.body);
            } catch {}
            process.exit(1);
        }

    }
    console.log("Using token " + token);
    console.log("Startup done!");
}

let server = http.createServer(((req, res) => {
    //console.log("Request Headers: " + JSON.stringify(req.headers));
    let body = Buffer.from('');
    let firstChunk = true;
    req.on('data', chunk => {
        if (firstChunk) {
            firstChunk = false;
            body = chunk;
        } else {
            body = Buffer.concat([body, chunk]);
        }
    });
    req.on('end', () => {
        //console.log("Request body: " + body);

        if ((!('x-signature-ed25519' in req.headers)) || (!('x-signature-timestamp' in req.headers))) {
            res.writeHead(401, "Unauthorized");
            res.end("Missing Signing headers");
            console.log("Missing Signing headers");
            return
        }

        try {
            const signature = req.headers['x-signature-ed25519'];
            const timestamp = req.headers['x-signature-timestamp'];

            const verifyBody = Buffer.concat([Buffer.from(timestamp), body]);

            const isVerified = nacl.sign.detached.verify(
                verifyBody,
                Buffer.from(signature, 'hex'),
                Buffer.from(PUBLIC_KEY, 'hex')
            );
            if (!isVerified) {
                res.writeHead(401, "Unauthorized");
                res.end('Bad request signature');
                console.log("Invalid request");
                return;
            }
            console.log("Successfully verified. Parsing body...");

            let jsonBody = JSON.parse(body.toString('utf-8'));

            console.log(JSON.stringify(jsonBody));

            let responseObj = {};

            switch (jsonBody.type) {
                case PING_TYPE: {
                    responseObj.type = PONG_TYPE;
                    break;
                }
                case APPLICATION_COMMAND_TYPE: {
                    responseObj.type = 4;
                    commands.parseCommand(jsonBody).then((r) => {
                        responseObj.data = r.responseData;
                        res.writeHead(200, 'OK');
                        res.end(JSON.stringify(responseObj));
                    });

                    return;
                }
            }

            res.writeHead(200, 'OK');
            res.end(JSON.stringify(responseObj));
        } catch (e) {
            console.error(e);
            res.writeHead(500, "Server Error");
            res.end();
        }
    });
}));

loadup().then(() => server.listen(8097));
