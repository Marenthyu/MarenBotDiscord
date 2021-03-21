'use strict';
let nepbot = require('./nepbot');
exports.parseCommand = async (data) => {

    let content = "A default response (Unknown command?)";

    let responseData = {
        content: content
    };

    switch (data.data.name) {
        case "marentesting": {
            responseData.content = "You invoked the testing command! Thanks for that, " + data.member.user.username + "!";
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
