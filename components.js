'use strict';
const constants = require("./discordConstants");
const {exec} = require("child_process");
let got = require('got');
exports.componentHandler = function (jsonBody) {
    let responseObj = {};
    console.log("A Component was used! See above for details...");
    responseObj.type = constants.UPDATE_MESSAGE_RESPONSE_TYPE;
    switch (jsonBody.data.component_type) {
        case 2: {
            // Button
            switch (jsonBody.data.custom_id) {
                case "ErinaButton": {
                    responseObj.data = {"content": "<:erina:237639561189130240>", components: []};
                    break;
                }
                case "trigger_rebuild": {
                    responseObj.data = {"content": "Triggering rebuild...", components: []};
                    exec('git -C ./rabiribi-randomizer-ui/ pull && sed -i -e \'$a\\ \' ./rabiribi-randomizer-ui/README.md && git -C ./rabiribi-randomizer-ui/ commit -a -m \'Automated commit via Discord to force rebuild\' && git -C ./rabiribi-randomizer-ui/ push', (error, stdout, stderr) => {
                        if (error) {
                            console.error(`exec error: ${error}`);
                            return;
                        }
                        console.log("stdout of rebuild trigger: " + stdout);
                        console.log("stderr of rebuild trigger: " + stderr);
                        got({
                            url: "https://discord.com/api/webhooks/" + jsonBody.application_id + "/" + jsonBody.token + "/messages/@original",
                            method: "PATCH",
                            json: {
                                content: "Done! (Hopefully successfully.)",
                                components: [
                                    {
                                        "type": 1,
                                        "components": [
                                            {
                                                "style": 5,
                                                "label": `Check AppVeyor`,
                                                "url": "https://ci.appveyor.com/project/wcko87/rabiribi-randomizer-ui-rc94b/build/artifacts",
                                                "disabled": false,
                                                "type": 2
                                            }
                                        ]
                                    }
                                ]
                            }
                        }).then(() => {
                            console.log("Sent response to edit original message");
                        })
                    });
                    break;
                }
                case "AddNepAlerts": {
                    responseObj.data = {
                        "content": "Please click the following Link to verify your subscription",
                        components: [
                            {
                                "type": 1,
                                "components": [
                                    {
                                        "style": 5,
                                        "label": `Finalize Notification Subscription`,
                                        "url": "https://discord.marenthyu.de/twitch/login?state=add-" + jsonBody.message.interaction.id,
                                        "disabled": false,
                                        "type": 2
                                    }
                                ]
                            }
                        ]
                    };
                    responseObj.nep_auth_state = {
                        id: jsonBody.message.interaction.id,
                        token: jsonBody.token,
                        application: jsonBody.application_id
                    };
                    break;
                }
                default: {
                    responseObj.data = {"content": "You interacted with a component, congratulations!", components: []};
                }
            }
            break;
        }
        case 3: {
            // Select Menu
            switch (jsonBody.data.custom_id) {
                case "BunnySelector": {
                    let splitparts = jsonBody.data.values[0].split(":");
                    responseObj.data = {
                        "content": "<:" + splitparts[1] + ":" + splitparts[2] + "> is the best <3",
                        components: []
                    };
                    break;
                }
                default: {
                    responseObj.data = {"content": "You interacted with a component, congratulations!", components: []};
                }
            }
            break;
        }
    }
    return responseObj;
}
