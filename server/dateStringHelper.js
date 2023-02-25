class dateStringHelper {
    static today(offset = 0) {
        let date = new Date();

        date.setDate(date.getDate() + offset);

        return this.toString(date);
    }

    static toString(date) {
        return date.toISOString().split('T')[0];
    }
}

module.exports = dateStringHelper;