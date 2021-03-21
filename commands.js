'use strict';
exports.parseCommand = async (data) => {

    let content = "A default response (Unknown command?)";

    switch (data.data.name) {
        case "marentesting": {
            content = "You invoked the testing command! Thanks for that, " + data.member.user.username + "!";
            break;
        }
        case "echo": {
            for (const option of data.data.options) {
                switch (option.name) {
                    case "something": {
                        content = option.value;
                        break;
                    }
                }
            }
            break;
        }
    }
    return {
        responseData: {
            content: content
        }
    }
};
