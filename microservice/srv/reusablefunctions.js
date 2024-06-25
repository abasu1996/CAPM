module.exports= function validateKey(jsonObj, key) {
    if (!(key in jsonObj || jsonObj.hasOwnProperty(key))) {
        // Key does not exist in the JSON object
        console.log(`Key '${key}' does not exist.`);
        return false;
    }

    if (jsonObj[key] === null) {
        console.log(`Key '${key}' has null value.`);
        return false;
    }

    if (typeof jsonObj[key] === 'object' && Object.keys(jsonObj[key]).length === 0) {
        console.log(`Key '${key}' has empty object value.`);
        return false;
    }

    if (jsonObj[key] === undefined) {
        console.log(`Key '${key}' is undefined.`);
        return false;
    }

    // Key exists and has a valid value
    return true;
}