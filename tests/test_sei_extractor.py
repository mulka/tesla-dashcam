import contextlib
import io
from pathlib import Path
import struct
import tempfile
import unittest

import dashcam_pb2

from sei_extractor import (
    extract_proto_payload,
    find_mdat,
    iter_sei_messages,
    main,
    strip_emulation_prevention_bytes,
)


def mp4_atom(atom_type: bytes, payload: bytes) -> bytes:
    return struct.pack(">I4s", len(payload) + 8, atom_type) + payload


def sei_nal(metadata: dashcam_pb2.SeiMetadata) -> bytes:
    payload = metadata.SerializeToString()
    return b"\x06\x05\x00\x42\x42\x69" + payload + b"\x80"


class SeiExtractorTests(unittest.TestCase):
    def setUp(self):
        self.metadata = dashcam_pb2.SeiMetadata(
            version=1,
            gear_state=dashcam_pb2.SeiMetadata.GEAR_DRIVE,
            frame_seq_no=42,
        )
        self.nal = sei_nal(self.metadata)
        mdat = struct.pack(">I", len(self.nal)) + self.nal
        self.video = mp4_atom(b"ftyp", b"isom") + mp4_atom(b"mdat", mdat)

    def test_extracts_and_decodes_metadata_from_mdat(self):
        stream = io.BytesIO(self.video)
        offset, size = find_mdat(stream)

        decoded = list(iter_sei_messages(stream, offset, size))

        self.assertEqual(len(decoded), 1)
        self.assertEqual(decoded[0], self.metadata)

    def test_extract_proto_payload_uses_sei_marker(self):
        payload = extract_proto_payload(self.nal)

        decoded = dashcam_pb2.SeiMetadata()
        decoded.ParseFromString(payload)
        self.assertEqual(decoded, self.metadata)

    def test_strips_h264_emulation_prevention_bytes(self):
        encoded = b"\x01\x00\x00\x03\x02\x00\x00\x03\x03"

        self.assertEqual(
            strip_emulation_prevention_bytes(encoded),
            b"\x01\x00\x00\x02\x00\x00\x03",
        )

    def test_cli_main_emits_csv_for_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            clip = Path(directory) / "clip.mp4"
            clip.write_bytes(self.video)
            output = io.StringIO()

            with contextlib.redirect_stdout(output):
                main(str(clip))

        rows = output.getvalue().splitlines()
        self.assertEqual(len(rows), 2)
        self.assertIn("frame_seq_no", rows[0].split(","))
        self.assertIn("42", rows[1].split(","))

    def test_find_mdat_rejects_files_without_media_data(self):
        stream = io.BytesIO(mp4_atom(b"ftyp", b"isom"))

        with self.assertRaisesRegex(RuntimeError, "mdat atom not found"):
            find_mdat(stream)


if __name__ == "__main__":
    unittest.main()
