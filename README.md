# gcode-3mf-plate-Combiner-and-multiplier
Disclaimer: I made this tool using common LLM's to help me speed up my personal workflow, I find it very usefull so wanted to share with everyone - you dont trust it, don't do it, I really dont care :) 

Vibe coded combiner and multiplier for use with .gcode.3mf project files that I regulary print on 3d printers that doesn't support moonrakers job queuing (I'm not really sure if this acts as tinkering, I might burn in hell). You can upload whole project file, the tool will automatically gather every .gcode files that are available there and combine them into one, and if specified - also multiplies them.
This **WILL NOT** add any custom gcode to your files it only reads the contents of .gcode files in your project file and combines them into one .gcode file.
All of the custom start and end gcode for your printer needs to be added in your slicer of choice. For a good inspiration on how to do it follow YouTube tutorial by Factorian Designs.
