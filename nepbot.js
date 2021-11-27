'use strict';
let mysql = require('promise-mysql');
let fs = require('fs');

let cfgfile = fs.readFileSync('/home/nepbot/nepbot-git/nepbot.cfg', 'utf8');
let cfglines = cfgfile.match(/[^\r\n]+/g);

let dbpw = null;
let dbname = null;
let dbuser = null;
let dbhost = null;
for (let line of cfglines) {
    let lineparts = line.split("=");
    if (lineparts[0] === "dbpassword") {
        dbpw = lineparts[1];
    } else if (lineparts[0] === "database") {
        dbname = lineparts[1];
    } else if (lineparts[0] === "dbuser") {
        dbuser = lineparts[1];
    } else if (lineparts[0] === "dbhost") {
        dbhost = lineparts[1];
    }
}

if (dbpw === null || dbname === null || dbuser === null || dbhost === null) {
    process.exit(1);
    return;
}

let con;
mysql.createConnection({
    host: dbhost,
    user: dbuser,
    password: dbpw,
    database: dbname,
    charset: "utf8mb4"
}).then(async (r) => {
    con = r;
    console.log("Connected!");
    await ping();
});

exports.getCurrentGodImageQueue = async () => {
    let result = await con.query('SELECT ' +
        'w.id as waifuid, ' +
        'w.name, w.series, ' +
        'COALESCE(c.customImage, w.image) as baseimage, ' +
        'g.image as godimage, ' +
        'g.cardid, ' +
        'c.userid, ' +
        'u.name as username, ' +
        'g.created ' +
        'FROM godimage_requests g JOIN cards c on cardid = c.id ' +
        'JOIN waifus w on c.waifuid = w.id ' +
        'JOIN users u ON c.userid = u.id ' +
        'WHERE g.state = \'pending\' ORDER BY g.created ASC;');
    console.log("Godimage queue: " + JSON.stringify(result));
    return result;
}

exports.createToken = async (newToken) => {
    try {
        let result = await con.query('INSERT INTO tokens(token, points, badgeID, waifuid, boostername, claimable, bet_prize, type, only_redeemable_by, not_redeemable_by) VALUES ?', [
            [
                newToken.name,
                newToken.points,
                newToken.badgeID ? newToken.badgeID : null,
                newToken.waifuID ? newToken.waifuID : null,
                newToken.boostername ? newToken.boostername : null,
                newToken.claimable ? 1 : 0,
                newToken.betprize,
                newToken.type,
                newToken.onlyredeemableby ? newToken.onlyredeemableby : null,
                newToken.notredeemableby ? newToken.notredeemableby : null
            ]
        ]);
        return result.affectedRows > 0;
    } catch (e) {
        return false;
    }


}


async function ping() {
    await con.ping();
    console.log("ping!");
    setTimeout(ping, 120000);
}
