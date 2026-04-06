with open(r'c:\Users\S15\OneDrive\Desktop\New-Saarthi\active-donation.html', 'r', encoding='utf-8') as f:
    content = f.read()
    
# Find the first complete HTML ending
end_marker = '</script>\n</body>\n</html>'
first_end = content.find(end_marker)
if first_end != -1:
    clean_content = content[:first_end + len(end_marker)]
    with open(r'c:\Users\S15\OneDrive\Desktop\New-Saarthi\active-donation.html', 'w', encoding='utf-8') as f:
        f.write(clean_content)
    print('File cleaned successfully!')
    print(f'Original length: {len(content)} chars')
    print(f'Cleaned length: {len(clean_content)} chars')
else:
    print('End marker not found')
