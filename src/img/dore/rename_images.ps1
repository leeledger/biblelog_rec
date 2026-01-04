# PowerShell script to rename Dore Bible images based on HTML file content
$htmlPath = "\\192.168.0.225\home\bible-reading-companion\src\img\dore\pg8710-images.html"
$imagesDir = "\\192.168.0.225\home\bible-reading-companion\src\img\dore\images"

# Read HTML content
$htmlContent = Get-Content -Path $htmlPath -Raw

# Create mapping for image names
$imageMap = @{}

# Extract title links from HTML
$matches = [regex]::Matches($htmlContent, '<a href="#link(\d{3})" class="pginternal">([^<]+)</a>')

foreach ($match in $matches) {
    $number = $match.Groups[1].Value
    $title = $match.Groups[2].Value.Trim()
    
    # Clean title for file naming (remove special characters and replace spaces with underscores)
    $cleanTitle = $title -replace '[^\w\s]', '' -replace '\s+', '_'
    
    # Store mapping
    $imageMap[$number] = $cleanTitle
}

# Rename files
foreach ($entry in $imageMap.GetEnumerator()) {
    $oldPath = Join-Path -Path $imagesDir -ChildPath "$($entry.Key).jpg"
    $newPath = Join-Path -Path $imagesDir -ChildPath "$($entry.Key)_$($entry.Value).jpg"
    
    if (Test-Path $oldPath) {
        Write-Host "Renaming: $($entry.Key).jpg to $($entry.Key)_$($entry.Value).jpg"
        Rename-Item -Path $oldPath -NewName "$($entry.Key)_$($entry.Value).jpg"
    } else {
        Write-Host "File not found: $oldPath"
    }
}

Write-Host "Image renaming completed!"
