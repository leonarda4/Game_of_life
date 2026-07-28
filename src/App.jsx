import { memo, useEffect, useRef, useState } from 'react'
import seaVideo from '../data/sea.mov'

const GRID_SIZE = 12

function createGrid(rows, cols, random = false) {
    return Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (random ? (Math.random() > 0.7 ? 1 : 0) : 0)),
    )
}

function countNeighbors(grid, row, col) {
    let count = 0
    for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
            if (dr === 0 && dc === 0) continue
            const nextRow = row + dr
            const nextCol = col + dc
            if (nextRow >= 0 && nextRow < grid.length && nextCol >= 0 && nextCol < grid[0].length) {
                count += grid[nextRow][nextCol]
            }
        }
    }
    return count
}

function nextGeneration(grid) {
    return grid.map((row, rowIndex) =>
        row.map((cell, colIndex) => {
            const neighbors = countNeighbors(grid, rowIndex, colIndex)
            if (cell === 1) {
                return neighbors === 2 || neighbors === 3 ? 1 : 0
            }
            return neighbors === 3 ? 1 : 0
        }),
    )
}

const BoardVideo = memo(function BoardVideo({ soundEnabled, videoRef }) {
    return (
        <video
            ref={videoRef}
            className="board-video"
            src={seaVideo}
            autoPlay
            muted={!soundEnabled}
            loop
            playsInline
            preload="auto"
            aria-hidden="true"
        />
    )
})

export default function App() {
    const [grid, setGrid] = useState(() => createGrid(GRID_SIZE, GRID_SIZE, true))
    const [running, setRunning] = useState(false)
    const [soundEnabled, setSoundEnabled] = useState(false)
    const videoRef = useRef(null)

    useEffect(() => {
        if (!running) return undefined

        const interval = window.setInterval(() => {
            setGrid((currentGrid) => nextGeneration(currentGrid))
        }, 240)

        return () => window.clearInterval(interval)
    }, [running])

    const toggleCell = (row, col) => {
        setGrid((currentGrid) =>
            currentGrid.map((gridRow, rowIndex) =>
                gridRow.map((cell, colIndex) => {
                    if (rowIndex === row && colIndex === col) {
                        return cell ? 0 : 1
                    }
                    return cell
                }),
            ),
        )
    }

    const reset = () => setGrid(createGrid(GRID_SIZE, GRID_SIZE))
    const randomize = () => setGrid(createGrid(GRID_SIZE, GRID_SIZE, true))
    const toggleSound = async () => {
        const nextSoundEnabled = !soundEnabled
        setSoundEnabled(nextSoundEnabled)

        if (!videoRef.current) return

        videoRef.current.muted = !nextSoundEnabled

        if (nextSoundEnabled) {
            try {
                await videoRef.current.play()
            } catch {
                setSoundEnabled(false)
                videoRef.current.muted = true
            }
        }
    }

    return (
        <main className="app-shell">
            <aside className="sidebar left-sidebar">
                <div className="controls">
                    <button onClick={() => setRunning((value) => !value)}>{running ? 'Stop' : 'Start'}</button>
                    <button onClick={() => setGrid((current) => nextGeneration(current))}>Step</button>
                    <button onClick={randomize}>Randomize</button>
                    <button onClick={reset}>Clear</button>
                    <button onClick={() => void toggleSound()}>{soundEnabled ? 'Sound Off' : 'Sound On'}</button>
                </div>
            </aside>

            <section className="center-panel">
                <div className="board-frame">
                    <div
                        className="grid"
                        style={{ '--grid-size': GRID_SIZE }}
                        role="grid"
                        aria-label="Game of Life board"
                    >
                        {grid.map((row, rowIndex) =>
                            row.map((cell, colIndex) => (
                                <button
                                    key={`${rowIndex}-${colIndex}`}
                                    className={`cell ${cell ? 'alive' : 'dead'}`}
                                    onClick={() => toggleCell(rowIndex, colIndex)}
                                    aria-label={`Cell ${rowIndex}, ${colIndex}`}
                                />
                            )),
                        )}
                    </div>
                    <BoardVideo soundEnabled={soundEnabled} videoRef={videoRef} />
                </div>
            </section>

            <aside className="sidebar right-sidebar">
                <div className="content-block">
                    <h2>About</h2>
                    <p>Conway&apos;s Game of Life is a cellular automaton devised by mathematician John Horton Conway in 1970.</p>
                </div>
                <div className="content-block">
                    <h2>Rules</h2>
                    <p>Any live cell with 2–3 neighbors survives. Any dead cell with exactly 3 neighbors becomes alive. All other cells die or stay dead.</p>
                </div>
                <div className="content-block">
                    <h2>Interact</h2>
                    <p>Click cells to seed the board, then press Start to watch the patterns evolve.</p>
                </div>
            </aside>
        </main>
    )
}
