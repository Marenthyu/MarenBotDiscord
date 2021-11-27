'use strict';
let nepbot = require('./nepbot');
let seedrandom = require('seedrandom');
let got = require('got');

exports.parseCommand = async (data) => {

    let content = "A default response (Unknown command?)";

    let responseData = {
        content: content
    };

    switch (data.data.name) {
        case "bunny": {
            responseData = await bunny();
            break;
        }
        case "echo": {
            for (const option of data.data.options) {
                switch (option.name) {
                    case "something": {
                        responseData.content = option.value;
                        break;
                    }
                }
            }
            break;
        }
        case "godimage": {
            responseData = await godImageHandler(data)
            break;
        }
        case "roll": {
            responseData = await dice(data);
            break;
        }
        case "townmember": {
            responseData = await townmember();
            break;
        }
        case "item": {
            responseData = await item();
            break;
        }
        case "rabistreams": {
            responseData = await rabistreams(data);
            break;
        }
        case "marentesting": {
            responseData = await randomenu(data);
            break;
        }
        case "rando": {
            responseData = await randomenu(data);
            break;
        }
    }
    return {
        responseData: responseData
    }
};

async function godImageHandler(data) {
    let retObj = {
        content: "Default GodImage response [not yet implemented command...]"
    }
    for (const option of data.data.options) {
        switch (option.name) {
            case "queue": {
                let queue = await nepbot.getCurrentGodImageQueue();
                retObj.content = "God Image Request Queue:\n";
                let empty = true;
                retObj.embeds = [];
                for (const request of queue) {
                    empty = false;
                    retObj.content += `[${request.cardid}] **${request.username}** wants to change [${request.waifuid}]**${request.name}** from **${request.series}**'s image from [this](<${request.baseimage}>) to [this](<${request.godimage}>).\n`
                }
                if (empty) {
                    retObj.content = "The Queue is empty! Well done! <:NepYay:268251076463951872>";
                }
                break;
            }
            case "check": {
                let cardid = -1;
                for (const subOption of option.options) {
                    if (subOption.name === "cardid") {
                        cardid = subOption.value;
                    }
                }
                let queue = await nepbot.getCurrentGodImageQueue();
                retObj.content = "";
                let found = false;
                retObj.embeds = [];
                for (const request of queue) {
                    if (request.cardid === cardid) {
                        found = true;
                        retObj.content += `[${request.cardid}] **${request.username}** wants to change [${request.waifuid}]**${request.name}** from **${request.series}**'s image from [this](${request.baseimage}) to [this](${request.godimage}).`
                        retObj.embeds.push({
                            title: `[${request.cardid}][${request.waifuid}]**${request.name}** from **${request.series}**'s current image`,
                            image: {
                                url: request.baseimage
                            }
                        });
                        retObj.embeds.push({
                            title: `[${request.cardid}][${request.waifuid}]**${request.name}** from **${request.series}**'s new image`,
                            image: {
                                url: request.godimage
                            },
                            footer: {
                                text: `Accept it in any NepNepBot chat using !godimage accept ${request.cardid}`
                            }
                        });
                        break;
                    }
                }
                if (!found) {
                    retObj.content = "Requested CardID does not have a pending godimage request.";
                }
                break;
            }
        }
    }
    return retObj;
}


async function dice(data) {
    let amount;
    let type;
    let modifier = 0;
    for (const option of data.data.options) {
        switch (option.name) {
            case "amount": {
                amount = option.value;
                break;
            }
            case "type": {
                type = option.value;
                break;
            }
            case "modifier": {
                modifier = option.value;
                break;
            }
        }
    }
    if (amount > 10000) {
        return {
            content: "That number is too big, smh.",
            flags: 64
        }
    }
    let content = "You rolled " + amount + "d" + type + (modifier !== 0 ? (modifier > 0 ? "+" + modifier : "" + modifier) : "") + ":\n(";
    let first = true;
    let total = 0;
    for (let i = 0; i < amount; i++) {
        let result = Math.floor(Math.random() * type) + 1;
        if (!first) {
            content += " + "
        } else {
            first = false;
        }
        content += result;
        total += result;
    }
    content += ")";
    if (modifier !== 0) {
        total += modifier;
        if (modifier < 0) {
            modifier *= -1;
            content += " -"
        } else {
            content += " +";
        }
        content += modifier;
    }
    content += " = " + total;
    if (content.length > 2000) {
        content = "You rolled " + amount + "d" + type + (modifier !== 0 ? (modifier > 0 ? "+" + modifier : "-" + modifier) : "") + " and rolled " + total;
    }
    console.log(total);
    return {
        content: content
    }
}

const TOWN_MEMBERS = ["Rumi", "Rita", "Nieve", "Nixie", "Aruraune", "Pandora", "Irisu", "Nobody...", "Cicini", "Syaro", "Cocoa", "Ashuri", "Lilith", "Vanilla", "Chocolate", "Kotri", "Keke Bunny", "Seana", "Miriam", "Miru", "Noah", "Erina", "Ribbon", "Lilli", "Pixie"]

async function townmember() {
    let now = new Date();
    let fullDaysSinceEpoch = Math.floor(now / 8.64e7);
    let prng = seedrandom(fullDaysSinceEpoch);
    let member = Math.floor(prng() * (TOWN_MEMBERS.length - 1));
    console.log(member + " is the member");
    return {
        content: "The Town Member of the day is " + TOWN_MEMBERS[member] + "!"
    }
}

const ITEMS = ["Fire Orb", "Water Orb", "Nature Orb", "Light Orb", "Piko Hammer", "Carrot Bomb", "Bunny Amulet", "Super Carrot", "Air Jump", "Rabi Slippers", "Sliding Powder", "Bunny Strike", "Wall Jump", "Wind Blessing", "Air Dash", "Bunny Whirl", "Hammer Roll", "Hammer Wave", "Speed Boost", "Soul Heart", "Spike Barrier", "Hourglass", "Strange Box", "Bunny Clover", "Bunny Memories", "Ribbon", "Sunny Beam", "Chaos Rod", "Healing Staff", "Explode Shot", "Carrot Shooter", "Quick Barrette", "Max Bracelet", "Charge Ring", "Plus Necklace", "Auto Earrings", "Book of Carrot", "P Hairpin", "Cyber Flower", "Fairy's Flute", "Rumi Donut", "Rumi Cake", "Gold Carrot", "Cocoa Bomb", "Health Up", "Mana Up", "Regen Up", "Pack Up", "Attack Up", "Health Plus", "Health Surge", "Mana Plus", "Mana Surge", "Crisis Boost", "ATK Grow", "DEF Grow", "ATK Trade", "DEF Trade", "Arm Strength", "Carrot Boost", "Weaken", "Self Defense", "Armored", "Lucky Seven", "Hex Cancel", "Pure Love", "Toxic Strike", "Frame Cancel", "Health Wager", "Mana Wager", "Stamina Plus", "Blessed", "Hitbox Down", "Cashback", "Survival", "Top Form", "Tough Skin", "Erina Badge", "Ribbon Badge", "Auto Trigger", "Lilith's Gift"]

async function item() {
    let now = new Date();
    let fullDaysSinceEpoch = Math.floor(now / 8.64e7);
    let prng = seedrandom(fullDaysSinceEpoch + 1);
    let item = Math.floor(prng() * (ITEMS.length - 1));
    console.log(item + " is the item");
    return {
        content: "The Item of the day is " + ITEMS[item] + "!"
    }
}

async function rabistreams(data) {
    let content_string = "Currently Live: ";
    let live_parts = []
    for (let channel of data.rabi_live) {
        live_parts.push("[" + channel.user_name + "](<https://twitch.tv/" + channel.user_login + ">) - **" + channel.title + "**");
    }
    content_string += live_parts.join(", ");
    return {
        content: content_string
    }
}

async function bunny() {
    let responseData = {};
    responseData.content = "Select the best!";
    responseData.components = [
        {
            type: 1,
            components: [
                {
                    type: 3,
                    custom_id: "BunnySelector",
                    placeholder: "Select a Bunny",
                    options: [
                        {
                            label: "Erina",
                            value: "EMOJI:erina:237639561189130240",
                            emoji: {
                                id: "237639561189130240",
                                name: "erina",
                                animated: false
                            }
                        },
                        {
                            label: "Keke",
                            value: "EMOJI:keke:352091489985363969",
                            emoji: {
                                id: "352091489985363969",
                                name: "keke",
                                animated: false
                            }
                        },
                        {
                            label: "Noah",
                            value: "EMOJI:noah:340057696239616000",
                            emoji: {
                                id: "340057696239616000",
                                name: "noah",
                                animated: false
                            }
                        },
                        {
                            label: "Noah 3",
                            value: "EMOJI:noah3:237644425059237888",
                            emoji: {
                                id: "237644425059237888",
                                name: "noah3",
                                animated: false
                            }
                        },
                        {
                            label: "Irisu",
                            value: "EMOJI:irisu:237639569137336320",
                            emoji: {
                                id: "237639569137336320",
                                name: "irisu",
                                animated: false
                            }
                        }
                    ]
                }
            ]
        }
    ]
    return responseData;
}

async function randomenu(data) {

    let appveyorInfo = await got('https://ci.appveyor.com/api/projects/wcko87/rabiribi-randomizer-ui-rc94b', {
        headers: {
            Authorization: "Bearer " + data.appveyor_token
        }
    }).json();

    //console.log(JSON.stringify(appveyorInfo))

    let latestJob = appveyorInfo.build.jobs[0];

    let latestJobId = latestJob.jobId;

    // for testing
    //latestJobId = "p17f5koln0f1ykm2";

    let responseContent = "Randomizer Menu - ";
    let responseComponents;

    switch (latestJob.status) {
        case "queued":
        case "started":
        case "running": {
            responseContent += "a build for Version " + appveyorInfo.build.version + " is " + latestJob.status + "! Check back in a bit!";
            responseComponents = [
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
            break;
        }
        case "success": {
            let artifactURL = "https://ci.appveyor.com/api/buildjobs/" + latestJobId + "/artifacts/randomizer-ui.zip";

            let artifactResponse;

            artifactResponse = await got({
                url: artifactURL,
                followRedirect: false,
                throwHttpErrors: false
            });

            console.log("Status Code of artifactRequest:" + artifactResponse.statusCode);

            responseContent += (artifactResponse.statusCode === 404 ? "Randomizer Build not found, you may want to trigger a rebuild!" : "Randomizer Build found, version " + appveyorInfo.build.version);
            responseComponents = [
                {
                    "type": 1,
                    "components": [
                        {
                            "style": 5,
                            "label": `Download`,
                            "url": artifactURL,
                            "disabled": artifactResponse.statusCode === 404,
                            "type": 2
                        },
                        {
                            "style": 5,
                            "label": `Check AppVeyor`,
                            "url": "https://ci.appveyor.com/project/wcko87/rabiribi-randomizer-ui-rc94b/build/artifacts",
                            "disabled": false,
                            "type": 2
                        },
                        {
                            "style": 4,
                            "label": `Trigger Rebuild`,
                            "custom_id": `trigger_rebuild`,
                            "disabled": artifactResponse.statusCode !== 404,
                            "type": 2
                        }
                    ]
                }
            ];
        }
    }

    return {
        content: responseContent,
        components: responseComponents
    }
}
