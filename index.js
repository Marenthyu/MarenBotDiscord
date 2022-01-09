'use strict';

const got = require('got');
const http = require('http');
const nacl = require('tweetnacl');
const fs = require('fs');

const commands = require('./commands');
const constants = require('./discordConstants');
const components = require('./components');
const crypto = require("crypto");

if (!fs.existsSync('secret.txt')) {
    console.error("Missing secret.txt for client secret. Please provide it.");
    process.exit(1);
}

if (!fs.existsSync('twitchsecret.txt')) {
    console.error("Missing twitchsecret.txt for Twitch client secret. Please provide it.");
    process.exit(1);
}

if (!fs.existsSync('rabi_discordhook.txt')) {
    console.error("Missing rabi_discordhook.txt for the discord webhook to notify about rabi-ribi live stream changes. Please provide it.");
    process.exit(1);
}

if (!fs.existsSync('nep_webhook.txt')) {
    console.error("Missing nep_webhook.txt for the discord webhook to notify about nep live stream changes. Please provide it.");
    process.exit(1);
}

if (!fs.existsSync('appveyortoken.txt')) {
    console.error("Missing appveyortoken.txt for the AppVeyor Token to check for Randomizer Builds. Please provide it.");
    process.exit(1);
}

if (!fs.existsSync('eventsubsecret.txt')) {
    console.error("Missing eventsubsecret.txt for the EventSub Secret so we can listen to Twitch notifications of people going live. Please provide it.");
    process.exit(1);
}

const secret = fs.readFileSync('secret.txt').toString().trim();
const twitch_secret = fs.readFileSync('twitchsecret.txt').toString().trim();
const rabi_discord_webhook = fs.readFileSync('rabi_discordhook.txt').toString().trim();
const nep_discord_webhook = fs.readFileSync('nep_webhook.txt').toString().trim();
const appveyor_token = fs.readFileSync('appveyortoken.txt').toString().trim();
const eventsub_secret = fs.readFileSync('eventsubsecret.txt').toString().trim();
const client_id = '183300066658877441';
const twitch_client_id = 'l687ieirmd7mmd5f77tfmb6xkq10s2';
const scope = 'applications.commands.update';

let token = fs.existsSync('token.txt') ? fs.readFileSync('token.txt') : false;
let twitch_token = fs.existsSync('twitchtoken.txt') ? fs.readFileSync('twitchtoken.txt') : false;


// Your public key can be found on your application in the Developer Portal
const PUBLIC_KEY = 'e3fe46878cb1fca040933cf820ee5c5dd391d37d85f5a1f1d4d0799ee79338ea';

let live_right_now = [];
let live_right_now_details = [];

let valid_nep_auth_states = [];

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
            } catch {
            }
        }
    }
    if (needsToken) {
        try {
            console.log({
                form: {
                    client_id: client_id,
                    client_secret: secret.toString(),
                    scope: scope,
                    grant_type: 'client_credentials'
                }
            });
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
            } catch {
            }
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

let server = http.createServer((async (req, res) => {
    const calledURL = new URL(req.url, 'https://' + (req.headers.hasOwnProperty('x-forwarded-host') ? req.headers['x-forwarded-host'] : req.headers['host']));
    switch (calledURL.pathname.substring(1)) {
        case "discordAppHook": {
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
                        case constants.PING_TYPE: {
                            responseObj.type = constants.PONG_TYPE;
                            break;
                        }
                        case constants.APPLICATION_COMMAND_TYPE: {
                            responseObj.type = constants.CHANNEL_MESSAGE_WITH_SOURCE_RESPONSE_TYPE;
                            jsonBody.rabi_live = live_right_now_details;
                            jsonBody.appveyor_token = appveyor_token;
                            commands.parseCommand(jsonBody).then((r) => {
                                responseObj.data = r.responseData;
                                res.writeHead(200, 'OK', {"Content-Type": "application/json"});
                                res.end(JSON.stringify(responseObj));
                                console.log(JSON.stringify(responseObj))
                            });

                            return;
                        }
                        case constants.MESSAGE_COMPONENT_TYPE: {
                            responseObj = components.componentHandler(jsonBody);
                            if (responseObj.nep_auth_state) {
                                valid_nep_auth_states.push(responseObj.nep_auth_state);
                                delete responseObj.nep_auth_state;
                            }
                            console.log("Responding with: ", JSON.stringify(responseObj));
                        }
                    }

                    res.writeHead(200, 'OK', {"Content-Type": "application/json"});
                    res.end(JSON.stringify(responseObj));
                } catch (e) {
                    console.error(e);
                    res.writeHead(500, "Server Error");
                    res.end();
                }
            });
            break;
        }
        case "twitch/callback": {
            if (req.method === 'POST') {
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
                req.on('end', async () => {

                    if (req.headers.hasOwnProperty('twitch-eventsub-message-signature')) {
                        let id = req.headers['twitch-eventsub-message-id'];
                        let timestamp = req.headers['twitch-eventsub-message-timestamp'];
                        let sigParts = req.headers['twitch-eventsub-message-signature'].split('=');

                        let computedSig = crypto.createHmac('sha256', eventsub_secret)
                            .update(id + timestamp + body)
                            .digest('hex');
                        let sentSig = sigParts[1];

                        if (computedSig !== sentSig) {
                            console.log("SIGNATURE MISMATCH:");
                            console.log("Expected: ", computedSig);
                            console.log("Got ", sentSig);
                            res.writeHead(401, "Invalid Signature");
                            res.end();
                        } else {
                            console.log("GOOD SIGNATURE");
                            let parsedBody = JSON.parse(body.toString());
                            console.log(JSON.stringify(parsedBody));
                            switch (req.headers['twitch-eventsub-message-type']) {
                                case "webhook_callback_verification": {
                                    res.writeHead(200, "OK");
                                    res.end(parsedBody.challenge);
                                    console.log("Acknowledged new subscription with id", parsedBody.subscription.id);
                                    break;
                                }
                                case "notification": {
                                    res.writeHead(204, "No Content");
                                    res.end();
                                    console.log("Got a notification!");
                                    switch (parsedBody.subscription.type) {
                                        case "channel.follow": {
                                            console.log(parsedBody.event.user_name, "has followed", parsedBody.event.broadcaster_user_name, "!");
                                            break;
                                        }
                                        case "user.authorization.grant": {
                                            //console.log("Got a grant notification:", JSON.stringify(parsedBody.event));
                                            console.log(parsedBody.event.user_name, "authorized", parsedBody.event.client_id);
                                            break;
                                        }
                                        case "stream.online": {
                                            console.log(parsedBody.event.broadcaster_user_name + " just went live - checking current info...");
                                            let response = await got({
                                                url: 'https://api.twitch.tv/helix/channels',
                                                searchParams: {broadcaster_id: parsedBody.event.broadcaster_user_id},
                                                method: 'GET',
                                                headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": twitch_client_id}
                                            }).json();
                                            let channelInfo = response.data[0];
                                            console.log(channelInfo.broadcaster_name, "went live with", channelInfo.game_name);
                                            await alertForNewChannelLive(channelInfo, nep_discord_webhook)
                                            break;
                                        }
                                        default: {
                                            console.log("Got unknown notification type", parsedBody.subscription.type);
                                        }
                                    }
                                    break;
                                }
                                case "revocation": {
                                    res.writeHead(204, "No Content");
                                    res.end();
                                    console.log("Revocation of subsctiption", parsedBody.subscription.id, "acknowledged.");
                                    break;
                                }
                            }

                        }
                    }
                });

            } else {
                res.writeHead(405, "Method not allowed");
                res.end("What are you doing?");
            }
            break;
        }
        case "twitch/login": {
            let code = calledURL.searchParams.get('code');
            let state = calledURL.searchParams.get('state');
            if (code) {
                let response;
                try {
                    response = await got({
                        url: 'https://id.twitch.tv/oauth2/token',
                        searchParams: {
                            client_id: twitch_client_id,
                            client_secret: twitch_secret,
                            code: code,
                            grant_type: 'authorization_code',
                            redirect_uri: 'https://' + calledURL.host + calledURL.pathname
                        },
                        method: 'POST'
                    }).json();
                } catch (e) {
                    console.error(e);
                    try {
                        console.error(e.response.body);
                    } catch (e) {
                    }
                    res.writeHead(500, "Error");
                    res.end("Something didn't work here - most likely, the code was invalid. Try again and click Allow this time!");
                    return;
                }
                let token = response.access_token;
                let verifyResponse;
                try {
                    verifyResponse = await got({
                        url: 'https://id.twitch.tv/oauth2/validate',
                        headers: {
                            Authorization: 'OAuth ' + token
                        },
                        method: 'GET'
                    }).json();
                } catch (e) {
                    console.error(e);
                    try {
                        console.error(e.response.body);
                    } catch (e) {
                    }
                    res.writeHead(500, "Error");
                    res.end("Something didn't work here - most likely, the code was invalid. Try again and click Allow this time!");
                    return;
                }

                res.writeHead(200, "OK");
                console.log("Verified user ", verifyResponse.login);

                switch (state.split("-")[0]) {
                    case "add": {

                        // Verify interaction ID to make it harder to maliciously add a subscription
                        let targetInteractionID = state.split("-")[1];
                        let foundID = false;
                        for (let valid of valid_nep_auth_states) {
                            if (valid.id === targetInteractionID) {
                                foundID = valid;
                                break;
                            }
                        }
                        if (!foundID) {
                            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! However, I could not verify that you actually are in the Nep Discord. Please try again. (This may not be your fault.)");
                            break;
                        }
                        console.log("Should add user here:", verifyResponse.user_id);
                        let subscriptions = await getAllSubscriptions();
                        let already_added = false;
                        for (let sub of subscriptions) {
                            if (sub.type === "stream.online" && sub.status === "enabled" && sub.condition.broadcaster_user_id === verifyResponse.user_id) {
                                already_added = sub.id;
                            }
                        }
                        let discordResponse = "";
                        if (already_added) {
                            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are already subscribed to, but thanks for renewing your authorization :3");
                            discordResponse = "Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are already subscribed to, but thanks for renewing your authorization :3";
                        } else {
                            try {
                                await createSubscription(verifyResponse.user_id);
                                res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are now subscribed to~");
                                await sendCustomAlert("**" + verifyResponse.login + "** has been added to go-live notifications!", nep_discord_webhook);
                                discordResponse = "Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are now subscribed to~";
                            } catch (e) {
                                console.log(e);
                                res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Something went wrong creating your subscription. Please let Marenthyu know the following: " + e.response.body);
                                discordResponse = "Thank you for verifying yourself, " + verifyResponse.login + "! Something went wrong creating your subscription. Please let Marenthyu know the following: " + e.response.body;
                            }
                        }
                        console.log("found ID: " + JSON.stringify(foundID));
                        got({
                            url: "https://discord.com/api/webhooks/" + foundID.application + "/" + foundID.token + "/messages/@original",
                            method: "PATCH",
                            json: {
                                content: discordResponse,
                                components: []
                            },
                            throwHttpErrors: false
                        }).then((response) => {
                            console.log("Sent response to edit original message for Nep Notification Adding");
                            console.log("Response object: " + response.body);
                        });
                        const index = valid_nep_auth_states.indexOf(foundID);
                        if (index > -1) {
                            valid_nep_auth_states.splice(index, 1);
                        }
                        break;
                    }
                    case "remove": {
                        console.log("Removing user:", verifyResponse.user_id);
                        let subscriptions = await getAllSubscriptions();
                        let id_to_remove = false;
                        for (let sub of subscriptions) {
                            if (sub.type === "stream.online" && sub.status === "enabled" && sub.condition.broadcaster_user_id === verifyResponse.user_id) {
                                id_to_remove = sub.id;
                            }
                        }
                        if (id_to_remove) {
                            try {
                                await deleteSubscription(id_to_remove);
                            } catch {
                                res.end("Thank you for verifying yourself, " + verifyResponse.login + "! There was an error removing your subscription - You probably were not on the list. Try again and make sure you are logged in to the correct account.");
                                break;
                            }
                            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Your notification subscription has been removed.");
                        } else {
                            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! However, your notification subscription could not be found. If you are sure your notifications are still subscribed to, make sure you are signed in to the correct Twitch Account and try again.");
                        }
                        break;
                    }
                    default: {
                        console.log("Unknown state passed: ", state);
                    }
                }

            } else {
                res.writeHead(302, "Found", {
                    'Location': 'https://id.twitch.tv/oauth2/authorize' +
                        '?client_id=' + twitch_client_id +
                        '&redirect_uri=' + encodeURIComponent(calledURL.toString().split('?')[0]) +
                        '&response_type=code' +
                        '&state=' + state
                });
                res.end("You should've been redirected.");
            }
            break;
        }
        default: {
            console.log("Unknown path " + req.url);
            res.writeHead(404, "Not Found");
            res.end("Not Found");
        }
    }
}));

loadup().then(() => server.listen(8097));


async function alertForNewChannelLive(channel, hook) {
    await got({
        url: hook,
        method: "POST",
        json: {
            content: "**" + channel.user_name + "** went live on Twitch with " + channel.game_name + "! Go watch them at https://twitch.tv/" + channel.user_login + " !\n" + channel.title,
            username: "MarenBot"
        }
    }).json();
}

async function sendCustomAlert(content, hook) {
    await got({
        url: hook,
        method: "POST",
        json: {
            content: content,
            username: "MarenBot"
        }
    }).json();
}

async function checkTwitchCategoryForNewPeople(initialize = false) {
    await verifyAndRenewTwitchToken();
    console.log("Checking who is live...");
    let new_live_now = [];
    let new_live_now_details = [];
    let response = {};
    do {
        let params = {"first": 100, game_id: "491266"}; // Minecraft: 27471, Rabi-Ribi: 491266
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
                await alertForNewChannelLive(channel, rabi_discord_webhook);
            }
        }
    } while (response.pagination && response.pagination.cursor);
    live_right_now = new_live_now;
    live_right_now_details = new_live_now_details;
    console.log("All through! " + live_right_now.length + " people are live!");
}

async function getAllSubscriptions() {
    await verifyAndRenewTwitchToken();
    console.log("Checking my EventSub Subscriptions...");
    let enabled_subscriptions = [];
    let response = {};
    do {
        let params = {"first": 100};
        if (response.pagination && response.pagination.cursor) {
            params.after = response.pagination.cursor;
        }
        response = await got({
            url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
            searchParams: params,
            method: 'GET',
            headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": twitch_client_id}
        }).json();
        for (let subscription of response.data) {
            enabled_subscriptions.push(subscription);
        }
    } while (response.pagination && response.pagination.cursor);
    console.log("All through!", enabled_subscriptions.length, "subscriptions found.");
    return enabled_subscriptions;
}

async function deleteSubscription(id) {
    await verifyAndRenewTwitchToken();
    console.log("Deleting subscription...");
    let response = await got({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
        searchParams: {"id": id},
        method: 'DELETE',
        headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": twitch_client_id}
    }).json();
    console.log("Subscription deleted.");
    return response;
}

async function createSubscription(user_id) {
    await verifyAndRenewTwitchToken();
    console.log("Creating subscription...");
    let response = await got({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
        method: 'POST',
        headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": twitch_client_id, "Content-Type": "application/json"},
        body: JSON.stringify({
            type: "stream.online",
            version: "1",
            condition: {
                broadcaster_user_id: user_id
            },
            transport: {
                method: "webhook",
                callback: "https://discord.marenthyu.de/twitch/callback",
                secret: eventsub_secret
            }
        })
    }).json();
    console.log("Subscription created.");
    return response;
}
