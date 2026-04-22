# EDX Composition Analyzer

A Python tool for analyzing EDX weight percentage data and calculating Fe concentration in FeₓNbS₂ samples.

## Features

- Computes Fe concentration from Fe and Nb weight percentages
- Supports multiple samples and multiple points per sample
- Tracks running averages
- Generates a formatted PDF report
- Organizes results by sample number

## Formula

x = (w_Fe / 55.845) * (92.906 / w_Nb)

## Usage

Run the script and enter:
- sample number
- optional sample name
- Fe weight %
- Nb weight %

The program generates a PDF report at the end.

## Requirements

- Python 3
- reportlab

## Output

- PDF report with separated sample sections
- point-by-point values
- running averages
- final average composition for each sample