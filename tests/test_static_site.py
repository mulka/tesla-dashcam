from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ScriptSourceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag != "script":
            return
        attributes = dict(attrs)
        if "src" in attributes:
            self.sources.append(attributes["src"])


class StaticSiteTests(unittest.TestCase):
    def test_explorer_script_assets_exist(self):
        parser = ScriptSourceParser()
        parser.feed((ROOT / "sei_explorer.html").read_text(encoding="utf-8"))

        self.assertIn("dashcam-mp4.js", parser.sources)
        self.assertIn("vendor/protobuf.min.js", parser.sources)
        self.assertIn("vendor/jszip.min.js", parser.sources)
        for source in parser.sources:
            self.assertTrue((ROOT / source).is_file(), source)

    def test_browser_parser_loads_the_tracked_schema(self):
        parser_source = (ROOT / "dashcam-mp4.js").read_text(encoding="utf-8")

        self.assertIn("fetch(protoPath)", parser_source)
        self.assertIn("dashcam.proto", parser_source)
        self.assertTrue((ROOT / "dashcam.proto").is_file())

    def test_explorer_declares_webcodecs_dependency(self):
        explorer_source = (ROOT / "sei_explorer.html").read_text(encoding="utf-8")

        self.assertIn("VideoDecoder", explorer_source)


if __name__ == "__main__":
    unittest.main()
