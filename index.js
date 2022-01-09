'use strict';

const got = require('got');
const http = require('http');
const nacl = require('tweetnacl');
const fs = require('fs');

const commands = require('./commands');
const constants = require('./discordConstants');
const components = require('./components');
const crypto = require("crypto");

const config = require('./config.json');

const discord_scope = 'applications.commands.update';

// tokens are kept in seperate files for ease of saving and refactoring. Config is for _static_ things.
let discord_token = fs.existsSync('token.txt') ? fs.readFileSync('token.txt') : false;
let twitch_token = fs.existsSync('twitchtoken.txt') ? fs.readFileSync('twitchtoken.txt') : false;

// "Global" Objects
let rabi_live_right_now = [];
let rabi_live_right_now_details = [];

let valid_nep_auth_states = [];

let recent_twitch_notifications = [];

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
                    client_id: config.twitch.client_id,
                    client_secret: config.twitch.client_secret.toString(),
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

async function verifyAndRenewDiscordToken() {
    let needsToken = true;
    if (discord_token) {
        try {
            await got({
                url: 'https://discord.com/api/oauth2/@me',
                method: 'GET',
                headers: {Authorization: 'Bearer ' + discord_token}
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
                    client_id: config.discord.client_id,
                    client_secret: config.discord.secret.toString(),
                    scope: discord_scope,
                    grant_type: 'client_credentials'
                }
            });
            let response = await got({
                url: 'https://discord.com/api/oauth2/token',
                method: 'POST',
                form: {
                    client_id: config.discord.client_id,
                    client_secret: config.discord.secret.toString(),
                    scope: discord_scope,
                    grant_type: 'client_credentials'
                }
            }).json();
            console.log("Got response for token, setting...");
            discord_token = response.access_token;

            fs.writeFileSync('token.txt', discord_token);

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
}

async function loadup() {
    console.log("Checking Discord token...");
    await verifyAndRenewDiscordToken();
    console.log("Using discord token " + discord_token);
    console.log("Checking Twitch token...");

    await verifyAndRenewTwitchToken();

    console.log("Using Twitch Token " + twitch_token);

    console.log("Doing initial Rabi-Ribi check for streamers!");

    await checkTwitchCategoryForNewPeople(true);

    setInterval(checkTwitchCategoryForNewPeople, 180000);

    console.log("Startup done!");
}

function handleDiscordSlashHook(req, res) {
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
                Buffer.from(config.discord.public_key, 'hex')
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
                    jsonBody.rabi_live = rabi_live_right_now_details;
                    jsonBody.appveyor_token = config.appveyor.token;
                    commands.parseCommand(jsonBody).then((r) => {
                        responseObj.data = r.responseData;
                        res.writeHead(200, 'OK', {"Content-Type": "application/json"});
                        res.end(JSON.stringify(responseObj));
                        //console.log(JSON.stringify(responseObj))
                    });

                    return;
                }
                case constants.MESSAGE_COMPONENT_TYPE: {
                    responseObj = components.componentHandler(jsonBody);
                    if (responseObj.nep_auth_state) {
                        valid_nep_auth_states.push(responseObj.nep_auth_state);
                        delete responseObj.nep_auth_state;
                    }
                    //console.log("Responding with: ", JSON.stringify(responseObj));
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
}

function handleEventSubCallback(req, res) {
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

                let computedSig = crypto.createHmac('sha256', config.twitch.eventsub_secret)
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
                    //console.log("GOOD SIGNATURE");
                    if (recent_twitch_notifications.indexOf(id) !== -1) {
                        console.log("Received duplicated / retried EventSub message", id, "- acknowledging, but ignoring...");
                        res.writeHead(200, "OK");
                        res.end(JSON.stringify({error:"Already Processed"}));
                    } else {
                        recent_twitch_notifications.push(id);
                        if (recent_twitch_notifications.length > 1000) {
                            recent_twitch_notifications.shift(); // remove first entry; We only keep track of the last 1000 messages. Don't want a memory leak.
                        }
                        let parsedBody = JSON.parse(body.toString());
                        //console.log(JSON.stringify(parsedBody));
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
                                            headers: {
                                                Authorization: 'Bearer ' + twitch_token,
                                                "Client-ID": config.twitch.client_id
                                            }
                                        }).json();
                                        let channelInfo = response.data[0];
                                        console.log(channelInfo.broadcaster_name, "went live with", channelInfo.game_name);
                                        // /streams and /channel returns it differently, so let's manually override it
                                        channelInfo.user_name = channelInfo.broadcaster_name;
                                        await alertForNewChannelLive(channelInfo, config.discord.nep_hook)
                                        break;
                                    }
                                    default: {
                                        console.log("Got unknown notification type", parsedBody.subscription.type);
                                        console.log(JSON.stringify(parsedBody));
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
            }
        });

    } else {
        res.writeHead(405, "Method not allowed");
        res.end("What are you doing?");
    }
}

async function validateTwitchLoginCode(response, code, calledURL, res, hadError) {
    try {
        response = await got({
            url: 'https://id.twitch.tv/oauth2/token',
            searchParams: {
                client_id: config.twitch.client_id,
                client_secret: config.twitch.client_secret,
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'https://' + calledURL.host + calledURL.pathname
            },
            method: 'POST'
        }).json();
    } catch (e) {
        console.error("Error handling Twitch Login:")
        try {
            console.error(e.response.body);
        } catch (e2) {
            console.error(e);
        }
        res.writeHead(500, "Error");
        res.end("Something didn't work here - most likely, the code was invalid. Try again and click Allow this time!");
        hadError = true;
    }
    return {response, hadError};
}

async function verifyTwitchUserFromTokenExchangeResponse(response, res, hadError) {
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
        console.error("Error validating Twitch Token:")
        try {
            console.error(e.response.body);
        } catch (e2) {
            console.error(e);
        }
        res.writeHead(500, "Error");
        res.end("Something didn't work here - most likely, the code was invalid. Try again and click Allow this time!");
        hadError = true;
    }
    return {verifyResponse, hadError};
}

async function handleAddToNotificationSubscriptionsState(state, res, verifyResponse) {
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
    } else {
        valid_nep_auth_states.splice(valid_nep_auth_states.indexOf(foundID), 1);
        console.log("Should add user here:", verifyResponse.user_id);
        let subscriptions = await getAllSubscriptions();
        let already_added = false;
        for (let sub of subscriptions) {
            if (sub.type === "stream.online" && sub.status === "enabled" && sub.condition.broadcaster_user_id === verifyResponse.user_id) {
                already_added = sub.id;
            }
        }
        let discordResponse;
        if (already_added) {
            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are already subscribed to, but thanks for renewing your authorization :3");
            discordResponse = "Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are already subscribed to, but thanks for renewing your authorization :3";
        } else {
            try {
                await createSubscription(verifyResponse.user_id);
                res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Your notifications are now subscribed to~");
                await sendCustomAlert("**" + verifyResponse.login + "** has been added to go-live notifications!", config.discord.nep_hook);
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
    }
}

async function handleRemoveFromNotificationSubscriptionState(verifyResponse, res) {
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
            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! Your notification subscription has been removed.");
        } catch {
            res.end("Thank you for verifying yourself, " + verifyResponse.login + "! There was an error removing your subscription - You probably were not on the list. Try again and make sure you are logged in to the correct account.");
        }
    } else {
        res.end("Thank you for verifying yourself, " + verifyResponse.login + "! However, your notification subscription could not be found. If you are sure your notifications are still subscribed to, make sure you are signed in to the correct Twitch Account and try again.");
    }
}

async function handleTwitchLogin(calledURL, res) {
    let code = calledURL.searchParams.get('code');
    let state = calledURL.searchParams.get('state');
    if (code) {
        let response = {};
        let hadError = false;
        const __ret = await validateTwitchLoginCode(response, code, calledURL, res, hadError);
        response = __ret.response;
        hadError = __ret.hadError;
        if (!hadError) {
            const __ret = await verifyTwitchUserFromTokenExchangeResponse(response, res, hadError);
            let verifyResponse = __ret.verifyResponse;
            hadError = __ret.hadError;
            if (!hadError) {
                res.writeHead(200, "OK");
                console.log("Verified user ", verifyResponse.login);

                switch (state.split("-")[0]) {
                    case "add": {
                        await handleAddToNotificationSubscriptionsState(state, res, verifyResponse);
                        break;
                    }
                    case "remove": {
                        await handleRemoveFromNotificationSubscriptionState(verifyResponse, res);
                        break;
                    }
                    default: {
                        console.log("Unknown state passed to twitch login:", state);
                    }
                }
            }
        }
    } else {
        res.writeHead(302, "Found", {
            'Location': 'https://id.twitch.tv/oauth2/authorize' +
                '?client_id=' + config.twitch.client_id +
                '&redirect_uri=' + encodeURIComponent(calledURL.toString().split('?')[0]) +
                '&response_type=code' +
                '&state=' + state
        });
        res.end("You should've been redirected.");
    }
}

let server = http.createServer((async (req, res) => {
    const calledURL = new URL(req.url, 'https://' + (req.headers.hasOwnProperty('x-forwarded-host') ? req.headers['x-forwarded-host'] : req.headers['host']));
    switch (calledURL.pathname.substring(1)) {
        case "discordAppHook": {
            handleDiscordSlashHook(req, res);
            break;
        }
        case "twitch/callback": {
            handleEventSubCallback(req, res);
            break;
        }
        case "twitch/login": {
            await handleTwitchLogin(calledURL, res);
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
    //console.log("Checking who is live...");
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
            headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": config.twitch.client_id}
        }).json();
        for (let channel of response.data) {
            new_live_now.push(channel.user_id);
            new_live_now_details.push(channel);
            if (rabi_live_right_now.indexOf(channel.user_id) === -1 && !initialize) {
                console.log("Rabi Notification! " + channel.user_name + " went live!");
                await alertForNewChannelLive(channel, config.discord.rabi_hook);
            }
        }
    } while (response.pagination && response.pagination.cursor);
    rabi_live_right_now = new_live_now;
    rabi_live_right_now_details = new_live_now_details;
    //console.log("All through! " + live_right_now.length + " people are live!");
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
            headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": config.twitch.client_id}
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
    console.log("Deleting subscription", id);
    let response = await got({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
        searchParams: {"id": id},
        method: 'DELETE',
        headers: {Authorization: 'Bearer ' + twitch_token, "Client-ID": config.twitch.client_id}
    }).json();
    console.log("Subscription deleted.");
    return response;
}

async function createSubscription(user_id) {
    await verifyAndRenewTwitchToken();
    console.log("Creating subscription for", user_id);
    let response = await got({
        url: 'https://api.twitch.tv/helix/eventsub/subscriptions',
        method: 'POST',
        headers: {
            Authorization: 'Bearer ' + twitch_token,
            "Client-ID": config.twitch.client_id,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            type: "stream.online",
            version: "1",
            condition: {
                broadcaster_user_id: user_id
            },
            transport: {
                method: "webhook",
                callback: "https://discord.marenthyu.de/twitch/callback",
                secret: config.twitch.eventsub_secret
            }
        })
    }).json();
    console.log("Subscription created.");
    return response;
}
