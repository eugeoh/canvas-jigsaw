import { JigsawPuzzle } from '../src/index.js';

const canvas = document.querySelector('#puzzle');
const stage = document.querySelector('#stage');
const sizeSelect = document.querySelector('#size');
const imageInput = document.querySelector('#image');
const restartButton = document.querySelector('#restart');
const progressElement = document.querySelector('#progress');
const messageElement = document.querySelector('#message');

const demoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f6c88f"/>
      <stop offset="1" stop-color="#7898a6"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#sky)"/>
  <circle cx="930" cy="170" r="92" fill="#fff2bd"/>
  <path d="M0 590L250 315 455 550 685 255 945 580 1200 370V800H0Z" fill="#374f57"/>
  <path d="M0 670L270 470 490 650 760 410 1010 625 1200 510V800H0Z" fill="#526f67"/>
  <path d="M0 720Q280 610 520 720T1200 690V800H0Z" fill="#8da06a"/>
  <text x="70" y="120" fill="#27383d" font-family="system-ui" font-size="58" font-weight="700">canvas-jigsaw</text>
</svg>`;

let imageSource = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(demoSvg)}`;
let puzzle;

async function createPuzzle() {
    puzzle?.destroy();

    const size = Number(sizeSelect.value);
    puzzle = new JigsawPuzzle({
        canvas,
        image: imageSource,
        rows: size,
        columns: size,
        seed: `demo-${size}`,
        width: stage.clientWidth,
        height: stage.clientHeight
    });

    puzzle.on('progress', updateProgress);
    puzzle.on('complete', () => {
        messageElement.textContent = 'Puzzle complete.';
    });

    await puzzle.initialize();
    updateProgress(puzzle.getProgress());
    messageElement.textContent = 'Drag matching pieces together.';
}

function updateProgress({ connected, total }) {
    progressElement.textContent = `${connected} / ${total} connected`;
}

sizeSelect.addEventListener('change', createPuzzle);
restartButton.addEventListener('click', createPuzzle);
imageInput.addEventListener('change', () => {
    const [file] = imageInput.files;
    if (!file) return;
    if (imageSource.startsWith('blob:')) URL.revokeObjectURL(imageSource);
    imageSource = URL.createObjectURL(file);
    createPuzzle();
});

await createPuzzle();
