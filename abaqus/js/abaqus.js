function getPyFile() {
    var fileText = "This is just some placeholder text for now."
    var file = new File(["Hello, world!"], "test_script.py", {type: "text/plain;charset=utf-8"});
    saveAs(file);
}