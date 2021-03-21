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
