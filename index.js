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

if (!fs.existsSync('twitchsecret.txt')) {
    console.error("Missing twitchsecret.txt for Twitch client secret. Please provide it.");
    process.exit(1);
}

if (!fs.existsSync('discordhook.txt')) {
    console.error("Missing discordhook.txt for the discord webhook to notify about live stream changes. Please provide it.");
    process.exit(1);
}

const secret = fs.readFileSync('secret.txt').toString().trim();
const twitch_secret = fs.readFileSync('twitchsecret.txt').toString().trim();
const discord_webhook = fs.readFileSync('discordhook.txt').toString().trim();
const client_id = '183300066658877441';
const twitch_client_id = 'l687ieirmd7mmd5f77tfmb6xkq10s2';
const scope = 'applications.commands.update';

let token = fs.existsSync('token.txt') ? fs.readFileSync('token.txt') : false;
let twitch_token = fs.existsSync('twitchtoken.txt') ? fs.readFileSync('twitchtoken.txt') : false;

// noinspection JSUnusedLocalSymbols
const PING_TYPE = 1, PONG_TYPE = 1, APPLICATION_COMMAND_TYPE = 2, MESSAGE_COMPONENT_TYPE = 3, APPLICATION_COMMAND_AUTOCOMPLETE_TYPE = 4;

const CHANNEL_MESSAGE_WITH_SOURCE_RESPONSE_TYPE = 4, UPDATE_MESSAGE_RESPONSE_TYPE = 7;

// Your public key can be found on your application in the Developer Portal
const PUBLIC_KEY = 'e3fe46878cb1fca040933cf820ee5c5dd391d37d85f5a1f1d4d0799ee79338ea';

let live_right_now = [];
let live_right_now_details = [];

async function verifyAndRenewTwitchToken() {
    let needsToken = true;
    if (twitch_token) {
        try {
            await got({
                url: 'https://id.twitch.tv/oauth2/validate',
                method: 'GET',
                headers: {Authorization: 'OAuth ' + twitch_token}
            }).json();
            needsToken = false;
            console.log("Old twitch token was valid, reusing...");
        } catch (e) {
            console.log("Error verifying twitch token, probably invalid: ");
            console.error(e);
            try {
                console.error(e.response.body);
            } catch {
            }
        }
    }

    if (needsToken) {
        try {
            let response = await got({
                url: 'https://id.twitch.tv/oauth2/token',
                method: 'POST',
                form: {
                    client_id: twitch_client_id,
                    client_secret: twitch_secret.toString(),
                    grant_type: 'client_credentials'
                }
            }).json();
            console.log("Got response for token, setting...");
            twitch_token = response.access_token;

            fs.writeFileSync('twitchtoken.txt', twitch_token);

        } catch (e) {
            console.error("Couldn't get new token:");
            console.error(e);
            try {
                console.error(e.response.body);
            } catch {
            }
            process.exit(1);
        }
    }
    return needsToken;
}

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
            console.log({form: {
                client_id: client_id,
                    client_secret: secret.toString(),
                    scope: scope,
                    grant_type: 'client_credentials'
            }});
            let response = await got({
                url: 'https://discord.com/api/oauth2/token',
                method: 'POST',
                form: {
                    client_id: client_id,
                    client_secret: secret.toString(),
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
    console.log("Using discord token " + token);
    console.log("Checking Twitch token...");

    await verifyAndRenewTwitchToken();

    console.log("Using Twitch Token " + twitch_token);

    console.log("Doing initial Rabi-Ribi check for streamers!");

    await checkTwitchCategoryForNewPeople(true);

    setInterval(checkTwitchCategoryForNewPeople, 180000);

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
                    responseObj.type = CHANNEL_MESSAGE_WITH_SOURCE_RESPONSE_TYPE;
                    jsonBody.rabi_live = live_right_now_details;
                    commands.parseCommand(jsonBody).then((r) => {
                        responseObj.data = r.responseData;
                        res.writeHead(200, 'OK', {"Content-Type":"application/json"});
                        res.end(JSON.stringify(responseObj));
                        console.log(JSON.stringify(responseObj))
                    });

                    return;
                }
                case MESSAGE_COMPONENT_TYPE: {
                    console.log("A Component was used! See above for details...");

                    responseObj.type = UPDATE_MESSAGE_RESPONSE_TYPE;
                    switch (jsonBody.data.component_type) {
                        case 2: {
                            // Button
                            switch (jsonBody.data.custom_id) {
                                case "ErinaButton": {
                                    responseObj.data = {"content":"<:erina:237639561189130240>", components:[]};
                                    break;
                                }
                                default: {
                                    responseObj.data = {"content":"You interacted with a component, congratulations!", components:[]};
                                }
                            }
                            break;
                        }
                        case 3: {
                            // Select Menu
                            switch (jsonBody.data.custom_id) {
                                case "BunnySelector": {
                                    let splitparts = jsonBody.data.values[0].split(":");
                                    responseObj.data = {"content":"<:" + splitparts[1] + ":" + splitparts[2] + "> is the best <3", components:[]};
                                    break;
                                }
                                default: {
                                    responseObj.data = {"content":"You interacted with a component, congratulations!", components:[]};
                                }
                            }
                            break;
                        }
                    }
                }
            }

            res.writeHead(200, 'OK', {"Content-Type":"application/json"});
            res.end(JSON.stringify(responseObj));
        } catch (e) {
            console.error(e);
            res.writeHead(500, "Server Error");
            res.end();
        }
    });
}));

loadup().then(() => server.listen(8097));


async function checkTwitchCategoryForNewPeople(initialize=false) {
    await verifyAndRenewTwitchToken();
    console.log("Checking who is live...");
    let new_live_now = [];
    let new_live_now_details = [];
    let response = {};
    do {
        let params = {"first":100, game_id: "491266"}; // Minecraft: 27471, Rabi-Ribi: 491266
        if (response.pagination && response.pagination.cursor) {
            params.after = response.pagination.cursor;
        }
        response = await got({
            url: 'https://api.twitch.tv/helix/streams',
            searchParams: params,
            method: 'GET',
            headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": twitch_client_id}
        }).json();
        for (let channel of response.data) {
            new_live_now.push(channel.user_id);
            new_live_now_details.push(channel);
            if (live_right_now.indexOf(channel.user_id) === -1 && !initialize) {
                console.log("I SENT A GO-LIVE-NOTIFICATION HERE! " + channel.user_name + " went live!");
                await got({
                    url: discord_webhook,
                    method: "POST",
                    json: {
                        content: "**" + channel.user_name + "** went live on Twitch with Rabi-Ribi! Go watch them at https://twitch.tv/" + channel.user_login + " !\n" + channel.title,
                        username: "MarenBot"
                    }
                }).json();
            }
        }
    } while(response.pagination && response.pagination.cursor);
    live_right_now = new_live_now;
    live_right_now_details = new_live_now_details;
    console.log("All through! " + live_right_now.length + " people are live!");
}
