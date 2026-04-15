"""
split_audio.py
1つのWAVファイルをスライドごとに分割する。
表示時間の比率でWAVの実際の長さを按分する。
"""

import sys
import os
import wave

def split_wav(wav_path, output_dir, slide_durations):
    """WAVファイルをスライドごとに分割する（実際の長さに按分）"""
    os.makedirs(output_dir, exist_ok=True)

    with wave.open(wav_path, 'rb') as wf:
        n_channels = wf.getnchannels()
        sample_width = wf.getsampwidth()
        framerate = wf.getframerate()
        total_frames = wf.getnframes()
        total_sec = total_frames / framerate

        print(f"Input: {wav_path}")
        print(f"  Channels: {n_channels}, Sample width: {sample_width}, Rate: {framerate}")
        print(f"  WAV actual duration: {total_sec:.2f}s")

        display_total = sum(slide_durations)
        print(f"  Display total: {display_total:.2f}s")
        print(f"  Difference: {total_sec - display_total:.2f}s")
        print()

        all_data = wf.readframes(total_frames)

    bytes_per_frame = n_channels * sample_width
    current_pos = 0

    for i, display_dur in enumerate(slide_durations):
        # WAVの実際の長さに按分
        ratio = display_dur / display_total
        actual_dur = ratio * total_sec
        n_frames = int(actual_dur * framerate)

        # 最後のスライドは残り全てを使う（端数対策）
        if i == len(slide_durations) - 1:
            n_frames = total_frames - current_pos

        start_byte = current_pos * bytes_per_frame
        end_byte = min((current_pos + n_frames) * bytes_per_frame, len(all_data))

        chunk = all_data[start_byte:end_byte]
        actual_frames = len(chunk) // bytes_per_frame

        filename = f"slide_{i+1:02d}.wav"
        filepath = os.path.join(output_dir, filename)

        with wave.open(filepath, 'wb') as out:
            out.setnchannels(n_channels)
            out.setsampwidth(sample_width)
            out.setframerate(framerate)
            out.writeframes(chunk)

        actual_sec = actual_frames / framerate
        print(f"  Slide {i+1:2d}: {filename} ({actual_sec:.2f}s, display: {display_dur:.2f}s)")
        current_pos += n_frames

    print(f"\nDone: {len(slide_durations)} files in {output_dir}")


if __name__ == "__main__":
    slide_durations = [
        21.74, 33.29, 42.25, 37.18, 48.62,
        30.62, 38.40, 33.90, 33.43, 41.57,
    ]

    wav_file = sys.argv[1] if len(sys.argv) > 1 else r"assets\audio\快眠習慣_音声.wav"
    output_dir = sys.argv[2] if len(sys.argv) > 2 else r"assets\audio"

    split_wav(wav_file, output_dir, slide_durations)
