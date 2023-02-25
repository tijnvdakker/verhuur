let db;

function getBuilder() {

    if (!db) {
        db = require('knex')({
            client: 'mysql',
            connection: {
                host: '127.0.0.1',
                port: 3306,
                user: 'root',
                password: '',
                database: 'shop'
            }
        });
    }

    return db;
}

module.exports = {
    getBuilder
}